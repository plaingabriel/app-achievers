import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/db/index';
import { invitation, user, userPermission } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { auth } from './auth';
import { sendEmail } from './email';
import { env } from './env';
import { areGrantable } from './permissions';
import { assertAdmin, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Invite-only onboarding (plan §8, ADR 0014). An admin creates an invitation
// (hashed single-use token + Resend email); the invitee accepts to set a
// password and get the invited access — either admin, or the per-table grant
// list carried on the invite. Admin-only to create/list/revoke; every export is
// a createServerFn so the bundler strips the db layer from the client bundle.
//
// getInvitation / acceptInvitation are PUBLIC (no session) — the invitee isn't a
// user yet. They re-validate the token server-side on every call.

const INVITE_TTL_DAYS = 7;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Store only a hash of the token; the raw token lives in the emailed link.
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

function acceptUrl(rawToken: string) {
  return `${env.BETTER_AUTH_URL}/accept-invite?token=${rawToken}`;
}

// — Admin: list + create + revoke ————————————————————————————————————————
export const fetchInvitationsData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertAdmin();

  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      isAdmin: invitation.isAdmin,
      permissions: invitation.permissions,
      expiresAt: invitation.expiresAt,
      usedAt: invitation.usedAt,
      createdAt: invitation.createdAt,
    })
    .from(invitation);

  const now = Date.now();
  const invitations = rows
    .map((r) => {
      const status: 'pending' | 'used' | 'expired' = r.usedAt
        ? 'used'
        : r.expiresAt.getTime() < now
          ? 'expired'
          : 'pending';
      return { ...r, permissions: (r.permissions as string[]) ?? [], status };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { invitations };
});

type CreateResult = MutationResult & { acceptUrl?: string };

// Create + email an invitation. Rejects if a user already exists for that email
// or a still-valid invitation is already pending. Returns the accept URL in dev
// (where the email is a no-op) so it can be tested without Resend.
export const createInvitation = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; isAdmin: boolean; permissions: string[] }) => data)
  .handler(async ({ data }): Promise<CreateResult> => {
    try {
      const { session, headers } = await assertAdmin();
      const email = data.email.trim().toLowerCase();

      if (!EMAIL_RE.test(email)) return { ok: false, error: es.invitations.invalidEmail };

      const [existingUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);
      if (existingUser) return { ok: false, error: es.invitations.userExists };

      // An admin invite carries no per-table grants (admins hold everything);
      // a non-admin invite must only carry grantable permissions.
      const permissions = data.isAdmin ? [] : data.permissions;
      if (!areGrantable(permissions))
        return { ok: false, error: es.invitations.invalidPermissions };

      const [pending] = await db
        .select({ id: invitation.id })
        .from(invitation)
        .where(
          and(
            eq(invitation.email, email),
            isNull(invitation.usedAt),
            gt(invitation.expiresAt, new Date()),
          ),
        )
        .limit(1);
      if (pending) return { ok: false, error: es.invitations.alreadyPending };

      const rawToken = randomBytes(32).toString('base64url');
      const id = randomUUID();
      const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

      await db.insert(invitation).values({
        id,
        email,
        tokenHash: hashToken(rawToken),
        isAdmin: data.isAdmin,
        permissions,
        invitedBy: session.user.id,
        expiresAt,
      });

      const url = acceptUrl(rawToken);
      const sent = await sendEmail({
        to: email,
        subject: es.invitations.email.subject,
        html: invitationHtml(url),
      });
      if (!sent.ok) logServerError('createInvitation:email', { email }, sent.error);

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: id,
        metadata: { email, isAdmin: data.isAdmin, permissions },
      });

      // Surface the link in dev (email is a no-op) so the flow is testable.
      return env.NODE_ENV === 'production' ? { ok: true } : { ok: true, acceptUrl: url };
    } catch (err) {
      logServerError('createInvitation', { email: data.email }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// Revoke a pending invitation by deleting it — the token then can't be found,
// so the accept flow rejects it (single-use is also enforced via used_at).
export const revokeInvitation = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertAdmin();

      const [target] = await db
        .select({ id: invitation.id, email: invitation.email })
        .from(invitation)
        .where(eq(invitation.id, data.id))
        .limit(1);
      if (!target) return { ok: false, error: es.invitations.notFound };

      await db.delete(invitation).where(eq(invitation.id, data.id));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: data.id,
        metadata: { email: target.email },
      });

      return { ok: true };
    } catch (err) {
      logServerError('revokeInvitation', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// — Public: inspect + accept ——————————————————————————————————————————————
type InvitationInfo =
  | { ok: true; email: string; isAdmin: boolean; permissions: string[] }
  | { ok: false; error: string };

// Look up an invitation by its raw token for the accept screen. Validates it's
// real, unused, and unexpired without requiring a session.
export const getInvitation = createServerFn({ method: 'POST' })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }): Promise<InvitationInfo> => {
    try {
      const [row] = await db
        .select({
          email: invitation.email,
          isAdmin: invitation.isAdmin,
          permissions: invitation.permissions,
          usedAt: invitation.usedAt,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(eq(invitation.tokenHash, hashToken(data.token)))
        .limit(1);

      if (!row) return { ok: false, error: es.invitations.invalidToken };
      if (row.usedAt) return { ok: false, error: es.invitations.used };
      if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: es.invitations.expired };

      return {
        ok: true,
        email: row.email,
        isAdmin: row.isAdmin,
        permissions: (row.permissions as string[]) ?? [],
      };
    } catch (err) {
      logServerError('getInvitation', {}, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// Accept an invitation: create the credential user, grant the invited role, and
// consume the token (single-use). Public — the invitee has no session yet.
export const acceptInvitation = createServerFn({ method: 'POST' })
  .inputValidator((data: { token: string; name: string; password: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { headers } = getRequest();
      const name = data.name.trim();
      if (name.length === 0) return { ok: false, error: es.invitations.nameRequired };
      if (data.password.length < 8) return { ok: false, error: es.changePassword.tooShort };

      const [row] = await db
        .select({
          id: invitation.id,
          email: invitation.email,
          isAdmin: invitation.isAdmin,
          permissions: invitation.permissions,
          invitedBy: invitation.invitedBy,
          usedAt: invitation.usedAt,
          expiresAt: invitation.expiresAt,
        })
        .from(invitation)
        .where(eq(invitation.tokenHash, hashToken(data.token)))
        .limit(1);

      if (!row) return { ok: false, error: es.invitations.invalidToken };
      if (row.usedAt) return { ok: false, error: es.invitations.used };
      if (row.expiresAt.getTime() < Date.now()) return { ok: false, error: es.invitations.expired };

      const [existingUser] = await db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, row.email))
        .limit(1);
      if (existingUser) return { ok: false, error: es.invitations.userExists };

      // Create the credential user via Better Auth's internal adapter (mirrors
      // the seed): createUser → linkAccount('credential') with the hashed pw.
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(data.password);
      const createdUser = await ctx.internalAdapter.createUser({
        email: row.email,
        name,
        emailVerified: false,
      });
      if (!createdUser) return { ok: false, error: es.errors.generic };
      await ctx.internalAdapter.linkAccount({
        userId: createdUser.id,
        providerId: 'credential',
        accountId: createdUser.id,
        password: hash,
      });

      // Apply the invited access: admin flag, or the per-table grant list.
      const permissions = (row.permissions as string[]) ?? [];
      if (row.isAdmin) {
        await db.update(user).set({ isAdmin: true }).where(eq(user.id, createdUser.id));
      } else if (permissions.length > 0) {
        await db.insert(userPermission).values(
          permissions.map((p) => {
            const [resource, action] = p.split(':') as [string, string];
            return { userId: createdUser.id, resource, action, grantedBy: row.invitedBy };
          }),
        );
      }

      // Consume the token (single-use).
      await db.update(invitation).set({ usedAt: new Date() }).where(eq(invitation.id, row.id));

      await recordAudit({
        actorId: createdUser.id,
        actorEmail: row.email,
        headers,
        action: 'invitation.used',
        targetType: 'invitation',
        targetId: row.id,
        metadata: { isAdmin: row.isAdmin, permissions },
      });

      return { ok: true };
    } catch (err) {
      logServerError('acceptInvitation', {}, err);
      return { ok: false, error: es.errors.generic };
    }
  });

function invitationHtml(url: string): string {
  const t = es.invitations.email;
  return `<div style="font-family:system-ui,sans-serif;color:#111;line-height:1.5">
  <h2 style="margin:0 0 12px">${t.heading}</h2>
  <p style="margin:0 0 16px">${t.body}</p>
  <p style="margin:0 0 16px">
    <a href="${url}" style="display:inline-block;padding:10px 16px;background:#000;color:#fff;text-decoration:none">${t.cta}</a>
  </p>
  <p style="margin:0 0 8px;color:#555;font-size:13px">${t.expiry}</p>
  <p style="margin:0;color:#555;font-size:13px">${t.ignore}</p>
</div>`;
}

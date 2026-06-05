import { randomBytes } from 'node:crypto';
import { db } from '@/db/index';
import { account, role, session, user, userRole } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { and, eq, max } from 'drizzle-orm';
import { AUDIT } from './audit';
import { auth } from './auth';
import { assertPermission, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// App-user lifecycle management (plan §4.4, phase 11 — "Miembros"). Manages the
// Better Auth `user` table (login accounts), NOT the frozen Personas data.
// Role assignment lives in /roles; user creation in /invitations. Every export
// is a createServerFn, so the bundler strips the db layer from the client.
// members:read to view; members:write to suspend/reset/force-change;
// members:delete to delete — admin-only per the seeded matrix.

// Last-admin guard: true if `userId` is an admin AND the only one. Suspending or
// deleting the only admin would lock everyone out, so it's blocked (mirrors the
// revokeRole guard in roles-server.ts).
async function wouldOrphanAdmin(userId: string): Promise<boolean> {
  const [adminRole] = await db
    .select({ id: role.id })
    .from(role)
    .where(eq(role.isSystem, true))
    .limit(1);
  if (!adminRole) return false;
  const holders = await db
    .select({ userId: userRole.userId })
    .from(userRole)
    .where(eq(userRole.roleId, adminRole.id));
  return holders.some((h) => h.userId === userId) && holders.length <= 1;
}

export const fetchMembersData = createServerFn({ method: 'GET' }).handler(async () => {
  const { session: caller } = await assertPermission('members:read');

  const [users, roleRows, lastLogins] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
        twoFactorEnabled: user.twoFactorEnabled,
        mustChangePassword: user.mustChangePassword,
        createdAt: user.createdAt,
      })
      .from(user),
    db
      .select({ userId: userRole.userId, roleName: role.name })
      .from(userRole)
      .innerJoin(role, eq(userRole.roleId, role.id)),
    db
      .select({ userId: session.userId, last: max(session.createdAt) })
      .from(session)
      .groupBy(session.userId),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.userId) ?? [];
    list.push(r.roleName);
    rolesByUser.set(r.userId, list);
  }
  const lastByUser = new Map<string, Date | null>();
  for (const l of lastLogins) lastByUser.set(l.userId, l.last);

  const members = users
    .map((u) => ({
      ...u,
      roles: rolesByUser.get(u.id) ?? [],
      lastLogin: lastByUser.get(u.id) ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));

  return { members, currentUserId: caller.user.id };
});

export const setMemberStatus = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; status: 'active' | 'suspended' }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session: caller, headers } = await assertPermission('members:write');
      if (data.userId === caller.user.id) return { ok: false, error: es.members.cantSelf };

      const [target] = await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.members.notFound };

      const suspending = data.status === 'suspended';
      if (suspending && (await wouldOrphanAdmin(data.userId)))
        return { ok: false, error: es.members.lastAdmin };

      await db.update(user).set({ status: data.status }).where(eq(user.id, data.userId));
      // Kick the user out immediately on suspend; the session.create.before hook
      // then prevents them from logging back in until reactivated.
      if (suspending) await db.delete(session).where(eq(session.userId, data.userId));

      await recordAudit({
        actorId: caller.user.id,
        actorEmail: caller.user.email,
        headers,
        action: suspending ? AUDIT.memberSuspended : AUDIT.memberReactivated,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email },
      });
      return { ok: true };
    } catch (err) {
      logServerError('setMemberStatus', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

type ResetResult = MutationResult & { tempPassword?: string };

export const resetMemberPassword = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }): Promise<ResetResult> => {
    try {
      const { session: caller, headers } = await assertPermission('members:write');

      const [target] = await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.members.notFound };

      const [cred] = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, data.userId), eq(account.providerId, 'credential')))
        .limit(1);
      if (!cred) return { ok: false, error: es.members.noCredential };

      // Temp password the admin hands off; force a change on next login.
      const tempPassword = randomBytes(9).toString('base64url');
      const ctx = await auth.$context;
      const hash = await ctx.password.hash(tempPassword);

      await db.update(account).set({ password: hash }).where(eq(account.id, cred.id));
      await db.update(user).set({ mustChangePassword: true }).where(eq(user.id, data.userId));
      await db.delete(session).where(eq(session.userId, data.userId));

      await recordAudit({
        actorId: caller.user.id,
        actorEmail: caller.user.email,
        headers,
        action: AUDIT.memberPasswordReset,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email },
      });
      return { ok: true, tempPassword };
    } catch (err) {
      logServerError('resetMemberPassword', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const forcePasswordChange = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session: caller, headers } = await assertPermission('members:write');

      const [target] = await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.members.notFound };

      await db.update(user).set({ mustChangePassword: true }).where(eq(user.id, data.userId));
      // Drop sessions so the flag takes effect on their next login (requireUser
      // redirects must_change_password users to /change-password).
      await db.delete(session).where(eq(session.userId, data.userId));

      await recordAudit({
        actorId: caller.user.id,
        actorEmail: caller.user.email,
        headers,
        action: AUDIT.memberForcePwChange,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email },
      });
      return { ok: true };
    } catch (err) {
      logServerError('forcePasswordChange', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deleteMember = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session: caller, headers } = await assertPermission('members:delete');
      if (data.userId === caller.user.id) return { ok: false, error: es.members.cantSelf };

      const [target] = await db
        .select({ id: user.id, email: user.email })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.members.notFound };
      if (await wouldOrphanAdmin(data.userId)) return { ok: false, error: es.members.lastAdmin };

      // FK cascade removes session/account/two_factor/user_role; audit_log.userId
      // is set null so the trail (with actor_email) survives.
      await db.delete(user).where(eq(user.id, data.userId));

      await recordAudit({
        actorId: caller.user.id,
        actorEmail: caller.user.email,
        headers,
        action: AUDIT.memberDeleted,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email },
      });
      return { ok: true };
    } catch (err) {
      logServerError('deleteMember', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

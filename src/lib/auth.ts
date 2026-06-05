import { db, schema } from '@/db/index';
import { user } from '@/db/schema/index';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { createAuthMiddleware } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { AUDIT, recordAudit } from './audit';
import { env } from './env';

// Better Auth server instance (plan §4.4, §8).
// - email + password, invitation-only (no public signup; see invitations flow)
// - TOTP + backup codes via the twoFactor plugin
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'mysql', schema }),
  emailAndPassword: {
    enabled: true,
    // Registration is invitation-only; the invitation flow creates users.
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      // Surfaced in the session so route guards can force a password change
      // on first login (plan §8). Read-only from the client (set by the seed /
      // password-reset flows, cleared after a successful change).
      mustChangePassword: { type: 'boolean', input: false, defaultValue: false },
    },
  },
  // Audit sensitive auth events (plan §4.5, phase 10). login.success fires on
  // every session creation (the only reliable success signal, incl. the 2FA
  // path which completes at verify-totp). login.failure is recorded client-side
  // from the login screen, since a thrown sign-in error skips the after-hook and
  // the global error handler has no request path. invitation/role events are
  // audited in their own server functions.
  databaseHooks: {
    session: {
      create: {
        // Block suspended users from getting a session (members lifecycle,
        // phase 11). Returning false aborts session creation, so a suspended
        // account can't log back in even with valid credentials. Combined with
        // deleting their sessions on suspend, suspension is immediate + sticky.
        async before(session) {
          const [u] = await db
            .select({ status: user.status })
            .from(user)
            .where(eq(user.id, session.userId))
            .limit(1);
          if (u && u.status !== 'active') return false;
        },
        async after(session) {
          const [u] = await db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, session.userId))
            .limit(1);
          await recordAudit({
            actorId: session.userId,
            actorEmail: u?.email,
            action: AUDIT.loginSuccess,
            targetType: 'user',
            targetId: session.userId,
          });
        },
      },
    },
  },
  hooks: {
    // Runs after a successful endpoint. Audit 2FA enable/disable and logout —
    // each carries the acting session, which is still present at this point.
    after: createAuthMiddleware(async (ctx) => {
      const sess = ctx.context.session;
      if (!sess) return;
      const base = {
        actorId: sess.user.id,
        actorEmail: sess.user.email,
        headers: ctx.headers,
        targetType: 'user',
        targetId: sess.user.id,
      } as const;
      if (ctx.path === '/two-factor/enable') {
        await recordAudit({ ...base, action: AUDIT.twoFactorEnabled });
      } else if (ctx.path === '/two-factor/disable') {
        await recordAudit({ ...base, action: AUDIT.twoFactorDisabled });
      } else if (ctx.path === '/sign-out') {
        await recordAudit({ ...base, action: AUDIT.logout });
      }
    }),
  },
  plugins: [twoFactor({ issuer: 'Achievers' })],
});

export type Session = typeof auth.$Infer.Session;

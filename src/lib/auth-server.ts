import { db } from '@/db/index';
import { user } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { AUDIT, recordAudit } from './audit';
import { auth } from './auth';

// Resolves the current session + access (admin flag + per-table grants)
// server-side from the request cookies. The root route loads this once per
// navigation and exposes it on the router context, so child routes can gate
// access (beforeLoad) and the chrome can hide what the user can't reach. Access
// is resolved fresh on every request, so grant changes take effect immediately
// (ADR 0014, §8).
export const fetchSessionContext = createServerFn({ method: 'GET' }).handler(async () => {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  const { resolveAccess } = await import('./rbac');
  const access = session
    ? await resolveAccess(session.user.id)
    : { isAdmin: false, permissions: new Set<string>(), projectIds: new Set<number>() };
  return { session, isAdmin: access.isAdmin, permissions: [...access.permissions] };
});

// Records a failed login attempt (plan §4.5, phase 10). Called from the login
// screen when Better Auth returns a sign-in error — a thrown sign-in error skips
// the after-hook server-side, so the client is the reliable signal. Public (the
// caller isn't authenticated); records only the attempted email, never a
// password. actorId is null because the attempt didn't resolve to a session.
export const auditLoginFailure = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    const { headers } = getRequest();
    const email = data.email.trim().toLowerCase().slice(0, 255);
    if (!email) return { ok: true };
    await recordAudit({
      actorId: null,
      actorEmail: email,
      headers,
      action: AUDIT.loginFailure,
      targetType: 'user',
      targetId: email,
    });
    return { ok: true };
  });

// Clears the must_change_password flag for the signed-in user. Called by the
// change-password flow after Better Auth confirms the new password (plan §8).
export const clearMustChangePassword = createServerFn({ method: 'POST' }).handler(async () => {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('No autenticado.');
  await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, session.user.id));
  return { ok: true };
});

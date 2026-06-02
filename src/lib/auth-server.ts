import { db } from '@/db/index';
import { user } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { auth } from './auth';
import { getUserPermissions } from './rbac';

// Resolves the current session + flattened RBAC permissions server-side from the
// request cookies. The root route loads this once per navigation and exposes it
// on the router context, so child routes can gate access (beforeLoad) and the
// chrome can hide what the user can't reach. Permissions are resolved fresh on
// every request, so role changes take effect immediately (plan §4.4, §8).
export const fetchSessionContext = createServerFn({ method: 'GET' }).handler(async () => {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  const permissions = session ? [...(await getUserPermissions(session.user.id))] : [];
  return { session, permissions };
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

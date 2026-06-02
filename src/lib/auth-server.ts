import { db } from '@/db/index';
import { user } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { eq } from 'drizzle-orm';
import { auth } from './auth';

// Resolves the current session server-side from the request cookies. Used by
// route guards (beforeLoad) to gate access; returns null when unauthenticated.
export const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { headers } = getRequest();
  return auth.api.getSession({ headers });
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

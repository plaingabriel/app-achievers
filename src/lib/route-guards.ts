import { redirect } from '@tanstack/react-router';
import type { Permission } from './permissions';
import { hasPermission } from './permissions';

type GuardSession = { user: { mustChangePassword?: boolean | null } } | null | undefined;

// Shared beforeLoad guard for authenticated routes. Redirects anonymous users
// to /login, and users still carrying must_change_password to /change-password
// (plan §8). Keep the /change-password route OUT of this guard to avoid a loop.
export function requireUser(session: GuardSession) {
  if (!session) throw redirect({ to: '/login' });
  if (session.user.mustChangePassword) throw redirect({ to: '/change-password' });
}

// Permission gate for admin/feature routes (plan §4.4). Requires a valid user
// first, then the given permission; a user who lacks it is bounced to the
// dashboard (reachable by every authenticated user) rather than shown the page.
export function requirePermission(
  context: { session: GuardSession; permissions: readonly string[] },
  required: Permission,
) {
  requireUser(context.session);
  if (!hasPermission(context.permissions, required)) throw redirect({ to: '/' });
}

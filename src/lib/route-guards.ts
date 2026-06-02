import { redirect } from '@tanstack/react-router';

// Shared beforeLoad guard for authenticated routes. Redirects anonymous users
// to /login, and users still carrying must_change_password to /change-password
// (plan §8). Keep the /change-password route OUT of this guard to avoid a loop.
export function requireUser(
  session: { user: { mustChangePassword?: boolean | null } } | null | undefined,
) {
  if (!session) throw redirect({ to: '/login' });
  if (session.user.mustChangePassword) throw redirect({ to: '/change-password' });
}

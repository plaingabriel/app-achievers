import { redirect } from '@tanstack/react-router';
import type { Permission } from './permissions';
import { hasPermission } from './permissions';

type GuardSession =
  | { user: { mustChangePassword?: boolean | null; twoFactorEnabled?: boolean | null } }
  | null
  | undefined;

// Shared beforeLoad guard for authenticated routes. Redirects anonymous users
// to /login, users still carrying must_change_password to /change-password
// (plan §8), and users without 2FA to /setup-2fa — 2FA is mandatory (§4.4).
// Order matters: password change first, then 2FA. Keep the /change-password and
// /setup-2fa routes OUT of this guard to avoid a loop.
export function requireUser(session: GuardSession) {
  if (!session) throw redirect({ to: '/login' });
  if (session.user.mustChangePassword) throw redirect({ to: '/change-password' });
  if (!session.user.twoFactorEnabled) throw redirect({ to: '/setup-2fa' });
}

type GuardContext = {
  session: GuardSession;
  isAdmin: boolean;
  permissions: readonly string[];
};

// Per-table gate for the data routes (ADR 0014). Requires a valid user first;
// admins pass implicitly, otherwise the user must hold `required`. A user who
// lacks it is bounced to the dashboard (reachable by every authenticated user)
// rather than shown the page.
export function requirePermission(context: GuardContext, required: Permission) {
  requireUser(context.session);
  if (!context.isAdmin && !hasPermission(context.permissions, required)) {
    throw redirect({ to: '/' });
  }
}

// Admin-only gate for the management routes (members, permissions, invitations,
// logs, audit). Requires a valid user, then the admin flag.
export function requireAdmin(context: GuardContext) {
  requireUser(context.session);
  if (!context.isAdmin) throw redirect({ to: '/' });
}

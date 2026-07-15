import { es } from '@/i18n/es';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from './auth';
import { logError } from './error-log';
import type { Permission } from './permissions';
import { canAccessProject, resolveAccess } from './rbac';

// Shared server-only helpers for the admin server functions (RBAC, invitations).
// Imported ONLY inside createServerFn handlers, so the bundler strips this module
// (and its db import) out of the client bundle — never import it from a component.

// Audit logging lives in ./audit (append-only). Re-exported here so existing
// importers (`from './server-rbac'`) keep working after it moved out (plan §4.5).
export { recordAudit } from './audit';

// Result for mutating server functions. Business-rule failures come back as
// { ok: false } with a Spanish message to show the user — NOT thrown, so they
// reach the client cleanly and aren't logged as server crashes. Unexpected
// errors are logged server-side (logServerError) and returned as generic.
export type MutationResult = { ok: true } | { ok: false; error: string };

// Per-table authorization gate (ADR 0014). Re-resolves the caller's access from
// the request (never trusts the client) and throws unless they're an admin or
// hold `required`. Returns the session + headers so callers can attribute the
// audit entry. Used by the data-table server functions (personas/closers/…).
export async function assertPermission(required: Permission) {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('No autenticado.');
  const { isAdmin, permissions } = await resolveAccess(session.user.id);
  if (!isAdmin && !permissions.has(required)) throw new Error(es.errors.unauthorized);
  return { session, headers };
}

export async function assertProjectPermission(required: Permission, projectId: number) {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('No autenticado.');
  const access = await resolveAccess(session.user.id);
  if (!access.isAdmin && !access.permissions.has(required)) throw new Error(es.errors.unauthorized);
  if (!canAccessProject(access, projectId)) throw new Error(es.errors.unauthorized);
  return { session, headers, access };
}

// Admin-only gate (ADR 0014). Throws unless the caller is an admin. Used by the
// management server functions (members, permissions, invitations, audit, logs).
export async function assertAdmin() {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('No autenticado.');
  const { isAdmin } = await resolveAccess(session.user.id);
  if (!isAdmin) throw new Error(es.errors.unauthorized);
  return { session, headers };
}

// Log an unexpected server-side failure with context, so it surfaces in the dev
// server console / production logs AND lands in error_log (emitter='dashboard')
// for the log viewer (plan §4.6, phase 09). The DB write is fire-and-forget and
// self-swallowing, so logging never throws into the caller's catch block.
export function logServerError(action: string, context: Record<string, unknown>, err: unknown) {
  console.error(`[server] ${action} failed`, context, err);
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;
  void logError({
    level: 'error',
    message: `${action}: ${message}`,
    stack,
    source: action,
    metadata: context,
  });
}

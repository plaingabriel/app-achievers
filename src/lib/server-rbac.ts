import { randomUUID } from 'node:crypto';
import { db } from '@/db/index';
import { auditLog } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from './auth';
import type { Permission } from './permissions';
import { getUserPermissions } from './rbac';

// Shared server-only helpers for the admin server functions (RBAC, invitations).
// Imported ONLY inside createServerFn handlers, so the bundler strips this module
// (and its db import) out of the client bundle — never import it from a component.

// Result for mutating server functions. Business-rule failures come back as
// { ok: false } with a Spanish message to show the user — NOT thrown, so they
// reach the client cleanly and aren't logged as server crashes. Unexpected
// errors are logged server-side (logServerError) and returned as generic.
export type MutationResult = { ok: true } | { ok: false; error: string };

// Authorization gate. Re-resolves the caller's permissions from the request
// (never trusts the client) and throws if `required` is missing. Returns the
// session + headers so callers can attribute the audit entry.
export async function assertPermission(required: Permission) {
  const { headers } = getRequest();
  const session = await auth.api.getSession({ headers });
  if (!session) throw new Error('No autenticado.');
  const perms = await getUserPermissions(session.user.id);
  if (!perms.has(required)) throw new Error(es.errors.unauthorized);
  return { session, headers };
}

type AuditEntry = {
  actorId: string | null;
  actorEmail: string | null | undefined;
  headers: Headers;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

// Append-only audit row (plan §4.5). ip/user_agent are captured from the request.
export async function recordAudit(e: AuditEntry) {
  await db.insert(auditLog).values({
    id: randomUUID(),
    userId: e.actorId,
    actorEmail: e.actorEmail ?? null,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata ?? null,
    ip: e.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: e.headers.get('user-agent')?.slice(0, 255) ?? null,
  });
}

// Log an unexpected server-side failure with context, so it surfaces in the dev
// server console / production logs instead of silently becoming "generic".
export function logServerError(action: string, context: Record<string, unknown>, err: unknown) {
  console.error(`[server] ${action} failed`, context, err);
}

import { randomUUID } from 'node:crypto';
import { db } from '@/db/index';
import { auditLog } from '@/db/schema/index';

// Centralized audit logging (plan §4.5, phase 10). The audit_log table is
// APPEND-ONLY: this module only ever inserts. There is intentionally no update
// or delete path — not from here, not from any server function or route.
//
// Server-only: imported inside createServerFn handlers, Better Auth hooks, and
// the cron, so the bundler keeps it (and its db import) out of the client.

// Known audit actions. `action` stays a string at the column level, but listing
// the sensitive events here keeps emitters consistent and greppable.
export const AUDIT = {
  loginSuccess: 'login.success',
  loginFailure: 'login.failure',
  logout: 'session.revoked',
  twoFactorEnabled: 'twofactor.enabled',
  twoFactorDisabled: 'twofactor.disabled',
  invitationCreated: 'invitation.created',
  invitationRevoked: 'invitation.revoked',
  invitationUsed: 'invitation.used',
  permissionsChanged: 'permissions.changed',
  adminGranted: 'user.admin_granted',
  adminRevoked: 'user.admin_revoked',
  memberSuspended: 'member.suspended',
  memberReactivated: 'member.reactivated',
  memberPasswordReset: 'member.password_reset',
  memberForcePwChange: 'member.force_password_change',
  memberDeleted: 'member.deleted',
  errorLogPurged: 'system.error_log_purged',
} as const;

export type AuditEntry = {
  actorId: string | null;
  actorEmail: string | null | undefined;
  // Optional: cron / system events have no request. When present, ip + user
  // agent are captured from it.
  headers?: Headers;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
};

// Append-only audit row. ip/user_agent are captured from the request headers
// when available (plan §4.5).
export async function recordAudit(e: AuditEntry) {
  await db.insert(auditLog).values({
    id: randomUUID(),
    userId: e.actorId,
    actorEmail: e.actorEmail ?? null,
    action: e.action,
    targetType: e.targetType,
    targetId: e.targetId,
    metadata: e.metadata ?? null,
    ip: e.headers?.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: e.headers?.get('user-agent')?.slice(0, 255) ?? null,
  });
}

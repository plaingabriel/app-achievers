import { db } from '@/db/index';
import { auditLog } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { desc, eq } from 'drizzle-orm';
import { getUserPermissions } from './rbac';
import { assertPermission } from './server-rbac';

// Read side of the append-only audit log (plan §4.5, phase 10). Visibility:
// any user with `audit:read` sees their OWN rows; an admin with `audit:read_all`
// sees everyone's. There is deliberately NO create/update/delete server function
// here — the log is written only by ./audit and never mutated.
export const fetchAuditData = createServerFn({ method: 'GET' }).handler(async () => {
  const { session } = await assertPermission('audit:read');
  const perms = await getUserPermissions(session.user.id);
  const seeAll = perms.has('audit:read_all');

  // Note: metadata (json) is intentionally not selected — it serializes as
  // `unknown` (not transferable over a server fn) and the viewer doesn't show it.
  const base = db
    .select({
      id: auditLog.id,
      userId: auditLog.userId,
      actorEmail: auditLog.actorEmail,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetId: auditLog.targetId,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
    })
    .from(auditLog);

  const rows = await (seeAll ? base : base.where(eq(auditLog.userId, session.user.id)))
    .orderBy(desc(auditLog.createdAt))
    .limit(500);

  return { rows, seeAll };
});

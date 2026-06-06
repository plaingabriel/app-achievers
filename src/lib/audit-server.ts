import { db } from '@/db/index';
import { auditLog } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { desc } from 'drizzle-orm';
import { assertAdmin } from './server-rbac';

// Read side of the append-only audit log (plan §4.5, ADR 0014). Admin-only: the
// audit log is a management view, so only admins reach it and they see every
// row. There is deliberately NO create/update/delete server function here — the
// log is written only by ./audit and never mutated.
export const fetchAuditData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertAdmin();

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

  const rows = await base.orderBy(desc(auditLog.createdAt)).limit(500);

  return { rows, seeAll: true };
});

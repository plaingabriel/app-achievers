import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';
import { createServerFn } from '@tanstack/react-start';
import { desc } from 'drizzle-orm';
import { assertAdmin } from './server-rbac';

// Initial page of error_log for the viewer (plan §4.6, phase 09). The SSE stream
// (/api/logs/stream) only pushes rows created AFTER the connection opens, so the
// viewer seeds itself with the most recent rows here, then appends live ones.
// Admin-only (ADR 0014) — error_log can carry sensitive payloads.
export const fetchRecentLogs = createServerFn({ method: 'GET' }).handler(async () => {
  await assertAdmin();
  // Explicit columns: metadata (json) serializes as `unknown` over a server fn,
  // and the viewer doesn't render it. The SSE stream carries the full row.
  const rows = await db
    .select({
      id: errorLog.id,
      level: errorLog.level,
      message: errorLog.message,
      source: errorLog.source,
      emitter: errorLog.emitter,
      createdAt: errorLog.createdAt,
    })
    .from(errorLog)
    .orderBy(desc(errorLog.id))
    .limit(200);
  // Return ascending (oldest first) so the viewer appends newest at the bottom.
  return { logs: rows.reverse() };
});

import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';
import { AUDIT, recordAudit } from '@/lib/audit';
import { lt, sql } from 'drizzle-orm';
import cron from 'node-cron';

// Daily 03:30 UTC: purge error_log rows older than 7 days (plan §4.6).
// Single process today; a leader-lock would be added if we ever scale.
export function startCron() {
  cron.schedule(
    '30 3 * * *',
    async () => {
      const res = await db
        .delete(errorLog)
        .where(lt(errorLog.createdAt, sql`NOW() - INTERVAL 7 DAY`));
      const purged = res[0]?.affectedRows ?? 0;
      console.info('[cron] error_log purge complete: %d rows', purged);
      // System audit entry (no actor / no request) recording the row count.
      await recordAudit({
        actorId: null,
        actorEmail: null,
        action: AUDIT.errorLogPurged,
        targetType: 'error_log',
        targetId: 'retention',
        metadata: { purged },
      });
    },
    { timezone: 'UTC' },
  );
}

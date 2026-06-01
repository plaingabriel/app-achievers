import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';
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
      console.info('[cron] error_log purge complete', res);
      // TODO(phase-10): write a `system` audit_log entry with the row count.
    },
    { timezone: 'UTC' },
  );
}

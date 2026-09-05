import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';
import { AUDIT, recordAudit } from '@/lib/audit';
import { lt, sql } from 'drizzle-orm';
import cron from 'node-cron';
import { runAcsVentasIngest } from './acs-ventas-ingest';

// The dashboard's in-process schedules. Two today:
//   · every 3h — mirror ACS sales into `acs_ventas_diarias` (docs/db/).
//   · daily 03:30 UTC — purge error_log rows older than 7 days (plan §4.6).
// Single process today; a leader-lock would be added if we ever scale, and the
// ingest is the one that would need it first: two instances rewriting the same
// window would fight over the same rows.
export function startCron() {
  // Every 3 hours at :20 — the same cadence `meta-sheet-ingest` uses in
  // `server-achievers`, offset off the hour so the two do not both hammer their
  // sources at once. Sales keep moving after a day closes, so each pass rewrites
  // a trailing window instead of appending; see acs-ventas-ingest.ts.
  cron.schedule(
    '20 */3 * * *',
    async () => {
      // The ingest logs and swallows per project; this catch is for a failure
      // before that loop (a bad DATABASE_URL, say). A throw here would reach
      // node-cron's unhandled rejection, not this process's handler.
      try {
        await runAcsVentasIngest();
      } catch (err) {
        console.error('[cron] acs-ventas ingest failed to run', err);
      }
    },
    { timezone: 'UTC' },
  );

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

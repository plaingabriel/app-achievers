/**
 * Manual run of the ACS sales mirror. The scheduled pass lives in
 * `src/server/cron.ts` and covers a trailing 7-day window; this is for the first
 * fill and for backfills after a gap.
 *
 *   pnpm exec tsx --env-file=.env scripts/acs-ventas-ingest.ts        # 7 days
 *   pnpm exec tsx --env-file=.env scripts/acs-ventas-ingest.ts 400    # 400 days
 *
 * Safe to repeat: every pass replaces the window it reads, so running it twice
 * leaves the same rows. It writes to the production `Evergreen` through the SSH
 * tunnel like every other command here.
 *
 * The 366-day cap in `/api/public/.../series` does NOT apply — that is the
 * dashboard's own endpoint. This reads ACS, which has no such limit but does
 * page internally; a window wide enough to hit its page ceiling makes the ingest
 * refuse to write rather than store a partial total.
 */
import { runAcsVentasIngest } from '@/server/acs-ventas-ingest';

const raw = process.argv[2];
const days = raw === undefined ? undefined : Number.parseInt(raw, 10);

if (days !== undefined && (!Number.isFinite(days) || days < 1)) {
  console.error('El primer argumento debe ser un numero de dias mayor que cero.');
  process.exit(1);
}

await runAcsVentasIngest(days === undefined ? {} : { days });
console.info('[acs-ventas] manual run finished');
process.exit(0);

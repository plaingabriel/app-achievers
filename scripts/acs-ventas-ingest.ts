/**
 * Manual run of the ACS sales mirror. The scheduled passes live in
 * `src/server/cron.ts`: every 3h for live launches over a trailing 7-day window,
 * and daily for closed ones over their own `[desde, hasta]`.
 *
 *   pnpm exec tsx --env-file=.env scripts/acs-ventas-ingest.ts        # 7 days
 *   pnpm exec tsx --env-file=.env scripts/acs-ventas-ingest.ts 400    # 400 days
 *
 * This script always includes the closed launches, so it is also the way to pull
 * old sales in immediately instead of waiting for the daily pass. The number of
 * days only widens the trailing window of the LIVE launches; a closed launch is
 * always read over the window `metricas_historicas` declares for it, because
 * that is the window its sales are in.
 *
 * Safe to repeat: every pass replaces the days it reads, so running it twice
 * leaves the same rows. It writes to the production `Evergreen` through the SSH
 * tunnel like every other command here.
 *
 * The 366-day cap in `/api/public/.../series` does NOT apply — that is the
 * dashboard's own endpoint. This reads ACS, which has no such limit but does
 * page internally; a window wide enough to hit its page ceiling makes the ingest
 * refuse to write rather than store a partial total. Closed launches are read in
 * slices for that reason.
 */
import { runAcsVentasIngest } from '@/server/acs-ventas-ingest';

const raw = process.argv[2];
const days = raw === undefined ? undefined : Number.parseInt(raw, 10);

if (days !== undefined && (!Number.isFinite(days) || days < 1)) {
  console.error('El primer argumento debe ser un numero de dias mayor que cero.');
  process.exit(1);
}

await runAcsVentasIngest(
  days === undefined ? { includeHistorical: true } : { days, includeHistorical: true },
);
console.info('[acs-ventas] manual run finished');
process.exit(0);

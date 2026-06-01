# Phase 11 — Operations — backups, health, PM2

## Goal
Make the app operable on the droplet.

## Batch (small, do in order)
1. Confirm `scripts/achievers-backup.sh` produces a dump and syncs to B2.
2. Confirm `/api/healthz` gates on DB; wire PM2 via `ecosystem.config.cjs`.
3. Document/verify the restore + fire-drill runbooks.

## Files
`scripts/achievers-backup.sh, ecosystem.config.cjs, src/routes/api/healthz.ts, docs/runbooks/*`

## How to validate
- Running the backup script yields a `.sql.gz` locally and in B2.
- `pm2 start ecosystem.config.cjs` runs the built app; `pm2 reload` is zero-downtime.
- Stopping MySQL makes `/api/healthz` return 503.

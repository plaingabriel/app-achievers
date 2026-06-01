# Phase 09 — Error-log viewer (SSE + retention)

## Goal
Tail error_log live and purge old rows.

## Batch (small, do in order)
1. Build the log viewer consuming `GET /api/logs/stream`; filters by level/emitter/text/time.
2. Wire `src/server/cron.ts` to start with the app (daily 03:30 UTC purge).
3. Add a dashboard write path so app errors land in error_log with emitter='dashboard'.

## Files
`src/routes/api/logs.stream.ts, src/routes/logs/*, src/server/cron.ts`

## How to validate
- Inserting a test row makes it appear in the viewer within ~2s without refresh.
- Filters narrow by level and emitter.
- Rows older than 7 days are removed by the purge (test with a back-dated row).

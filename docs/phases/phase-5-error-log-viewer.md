# Phase 5 — Error-log viewer

**Goal:** live SSE log table with filters + the 7-day purge job.

**Prerequisites:** Phase 2 (Phase 4 for gating).
**Implements:** ADR 0005, 0008.

## Tasks
- [ ] `GET /api/logs/stream` SSE endpoint that emits new `error_log` rows. Disable nginx proxy buffering for this location (note in `docs/runbooks/deploy.md`).
- [ ] Log table UI: columns level/emitter/message/source/time; filter by level, emitter, free-text, time range; default last 24h, level >= warn.
- [ ] `EventSource` client with auto-reconnect; documented 5s polling fallback.
- [ ] In-process `node-cron` purge at 03:30 UTC: `DELETE FROM error_log WHERE created_at < NOW() - INTERVAL 7 DAY`; write a `system` audit entry with row count.
- [ ] Gate the page behind `logs:read`.
- [ ] (Later, same dev) add the `emitter='express-server'` writer to the Express repo per `docs/db/error_log.md`. Until then only `dashboard` rows appear — expected.

## Acceptance criteria
- New rows appear live without refresh.
- Filters work on initial load and the live stream.
- Purge removes rows older than 7 days and logs the count.

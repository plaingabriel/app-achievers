# `error_log` contract (plan §4.6)

`error_log` is written by **two** programs and read by the dashboard UI.

## Schema
`src/db/schema/app.ts` is the source of truth. Columns: `id` (bigint auto),
`level`, `message`, `stack`, `source`, `request_id`, `metadata` (json),
`emitter`, `created_at`. Indexed on `created_at`, `(level, created_at)`,
`(emitter, created_at)`.

## Writers
- Dashboard → `emitter = 'dashboard'`.
- Existing Express server → `emitter = 'express-server'`.

The Express-side writer (the insert adapter) is owned by the **same maintainer**
who builds the dashboard, so there is no two-party handoff; this doc is
self-documentation / future-proofing for any future contributor.

Minimal Express-side writer:

```js
async function logError(level, message, err) {
  await db.query(
    "INSERT INTO error_log (level, message, stack, emitter) VALUES (?, ?, ?, 'express-server')",
    [level, message, err?.stack ?? null]
  );
}
```

## Reader
Dashboard UI: SSE stream `GET /api/logs/stream`, filterable by level/emitter/
text/time. Retention: 7 days, purged daily 03:30 UTC by `src/server/cron.ts`.

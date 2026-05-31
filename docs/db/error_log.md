# Cross-repo contract: `error_log`

Owned by the dashboard (migrations). Written by both the dashboard and the Express server. Read by the dashboard's SSE viewer (ADR 0005). Rows older than 7 days are purged daily.

> Status: **not yet implemented anywhere.** The dashboard builds the table + reader in Phase 5; the same dev later adds the Express writer. Until then, only `emitter = 'dashboard'` rows exist.

## Columns
| Column | Type | Notes |
|---|---|---|
| `id` | bigint AUTO_INCREMENT PK | |
| `level` | varchar(16) | `debug` / `info` / `warn` / `error` / `fatal` |
| `message` | text NOT NULL | |
| `stack` | text NULL | |
| `source` | varchar(128) NULL | e.g. `express:routes/orders` |
| `request_id` | varchar(64) NULL | correlation |
| `metadata` | json NULL | |
| `emitter` | varchar(32) NOT NULL | `express-server` or `dashboard` |
| `created_at` | timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP | |

Indexes: `(created_at DESC)`, `(level, created_at DESC)`, `(emitter, created_at DESC)`.

## Writer contract (Express server)
Insert with `emitter = 'express-server'`. Do not alter the table schema — request a dashboard migration if a column is needed.

## Retention
Daily purge at 03:30 UTC removes rows older than 7 days; the dashboard logs a `system` audit entry with the deleted count.

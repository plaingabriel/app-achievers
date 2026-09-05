# `meta_ads_diarias` contract

Daily Meta Ads figures per project and campaign. Written by **`server-achievers`**,
read by the dashboard's series endpoint. Same two-party shape as `error_log.md`.

## Schema

`src/db/schema/app.ts` is the source of truth; migration `0011_meta_ads_diarias`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint auto | |
| `proyecto_id` | bigint | FK → `proyecto.id`, `ON DELETE CASCADE` |
| `dia` | date | the day the figures belong to, never a timestamp |
| `campana` | varchar(255) | campaign name exactly as the sheet spells it |
| `inversion` | decimal(12,2) | money, never a float |
| `clics_enlace` | bigint | |
| `landing_views` | bigint | |
| `registros_completados` | bigint | pixel count, **not** rows in `registros` |
| `leads` | bigint | pixel count, **not** rows in `registros` |
| `suscripciones` | bigint | |
| `created_at`, `updated_at` | timestamp | `updated_at` is `ON UPDATE CURRENT_TIMESTAMP` |

`UNIQUE (proyecto_id, dia, campana)`, plus an index on `(proyecto_id, dia)`.

**The unique key is the point of the table.** The sheet is filled by a third
party connector that re-exports past days, and it already contains four campaigns
duplicated on 2026-08-24 — same name, same day, two rows. Any consumer that sums
double counts them. The writer must `INSERT ... ON DUPLICATE KEY UPDATE` so a
re-export overwrites the day instead of adding to it.

## Writer

`server-achievers`, a scheduled job under `src/jobs/`. For every project with
`proyecto.meta_metrics_sheet_id` set, it reads that Google Sheet with the service
account already configured there (`config.externalAPIs.getGoogleAuthClient()`,
scope `spreadsheets`) and upserts the rows.

Column mapping, sheet header → table column:

| Sheet header | Column |
|---|---|
| `Date` | `dia` |
| `Campaign Name` | `campana` |
| `Spend (Cost, Amount Spent)` | `inversion` |
| `Action Link Clicks` | `clics_enlace` |
| `Action Landing Page View` | `landing_views` |
| `Action FB Pixel Complete Registration (Offsite Conversion)` | `registros_completados` |
| `Action FB Pixel Lead (Offsite Conversion)` | `leads` |
| `Action Subscribe Website` | `suscripciones` |

Those headers are the same strings `fetchProjectMetaGoalMetrics`
(`src/lib/projects-dashboard-server.ts`) already reads out of the sheet proxy, so
the two paths cannot drift apart on naming.

**Re-ingest a trailing window, not just yesterday.** Meta's attribution rewrites
recent days and the connector re-exports them; re-reading the last ~7 days on
every pass lets the unique key absorb the correction.

## Why the sheet and not the Graph API

`server-achievers` already talks to `graph.facebook.com` in
`src/jobs/tasks/meta-metrics.ts`, and `time_increment=1` would give the same
grain from the source. It is deliberately not used here: the dashboard's own Meta
card reads the sheet, so pulling from the API would produce a second number for
the same day, computed a second way, drifting with attribution windows. That is
the single failure mode `docs/runbooks/metrics-db-user.md` exists to prevent.

The Graph API stays useful as a way to audit the sheet, and as the fallback if
the connector is ever retired.

## Reader

`Metricas`.`v_meta_ads_diarias` (`scripts/metrics-views.sql`) projects the table
for the metrics panel; the series endpoint serves it as `inversion_meta`,
`clics_meta`, `landing_views_meta`, `registros_meta`, `leads_meta` and
`suscripciones_meta`, groupable by `campana`. See the runbook, section 5.

## Currency

USD, confirmed 2026-09-05. The table stores a bare number: the sheet carries no
currency column, so nothing in the data says so. The dashboard formats Meta spend
as USD (`formatCurrency`, `src/routes/proyectos/index.tsx`) and the catalogue
publishes `unidad: "usd"` to match.

If the ad account is ever switched to another currency the sheet will keep the
same shape and every number will silently change meaning. There is no automatic
guard against that — the check is a human one.

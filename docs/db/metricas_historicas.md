# `metricas_historicas` contract

Totals declared by hand for launches that ran **before this dashboard existed**,
so their dash is not empty. Decided in
[ADR 0015](../adr/0015-historical-launch-totals.md); loaded through
[`docs/runbooks/backfill-lanzamientos.md`](../runbooks/backfill-lanzamientos.md).

> **Status: agreed, not built.** Migration `0014` and the loading screen are
> pending. This file is the contract they must satisfy; it describes intent, not
> something already running. Delete this banner when `0013` is applied.

Unlike `error_log` (written by `server-achievers`), `meta_ads_diarias` (written
by an ingest job) and `acs_ventas_diarias` (written by the dashboard's cron),
**the writer here is a person.** There is no source system to re-read: if the
number is wrong, someone typed it wrong.

## VIP only when nothing else has the launch

VIP has three possible sources and this table is the last of them. Measured on
2026-09-07:

| Launch | ACS | Notion | Where VIP comes from |
|---|---|---|---|
| Abril 2025 | 0 | 0 | **here**, typed by hand |
| Octubre 2025 | 0 | 0 | **here**, typed by hand |
| Mayo 2026 | 1 | 2.120 | Notion, per day — not here |
| Septiembre 2026 | 2.275 | 0 | `acs_ventas_diarias`, per day — not here |

A VIP figure typed in for one of the last two would be a worse copy of a daily
series that can be fetched, and the two would drift. Only Abril 2025 and Octubre
2025 have nothing anywhere: those editions exist in ACS and answer empty, and
Notion holds no page of the product before 2026-04-01.

**Before typing a VIP total, check both.** The commands and the readings are in
[the runbook](../runbooks/backfill-lanzamientos.md) §1.1 and §1.2. Leave `vip`
`NULL` when
either source answers — that is the flag saying "this one is fetched".

## One row per project

`src/db/schema/app.ts` is the source of truth; migration `0014`.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint auto | |
| `proyecto_id` | bigint | FK → `proyecto.id`, `ON DELETE CASCADE`, **UNIQUE** |
| `desde` | date | first day of the launch, inclusive |
| `hasta` | date | last day of the launch, inclusive |
| `registros` | bigint | leads registered over the whole window |
| `encuestas` | bigint | surveys answered over the whole window |
| `grupos` | bigint | people added to WhatsApp groups over the whole window |
| `vip` | bigint | VIP entries sold — **only** when ACS has none; `NULL` otherwise |
| `fuente` | varchar(255) | where the numbers came from — see below |
| `notas` | text | nullable; anything that qualifies the figures |
| `created_at`, `updated_at` | timestamp | `updated_at` is `ON UPDATE CURRENT_TIMESTAMP` |

**`proyecto_id` is unique**: a project has one history or none. There is no day,
campaign or origin in the key because there is no such breakdown to key on — that
is the whole premise. A project that later gains real row-level data should have
its historical row **deleted**, not kept alongside; see "Never both" below.

`desde`/`hasta` are `date`, not timestamps. The window is a pair of calendar days
in the same sense as `acs_ventas_diarias.dia`.

**`fuente` is not decoration and is `NOT NULL`.** Every other table here can be
rebuilt from its source; this one cannot. Six months from now the only way to
answer "is this 8.420 right?" is the sentence someone wrote in this column —
which sheet, which export, which screenshot, dated. "Woker" is not a `fuente`;
"Hoja 'Leads Mayo 2026', pestaña Resumen, exportada 2026-09-07" is.

## `0` and `NULL` mean different things

A metric that was measured and came out zero stores `0`. A metric nobody has a
figure for stores `NULL`, and the dash shows it as unknown, not as zero. The four
metric columns are therefore nullable — the one place in this schema where a
nullable count is deliberate. A row with all four `NULL` should not exist; delete
it instead.

`vip` carries a second meaning on top of that: `NULL` there also means "ACS or
Notion has this launch, go and fetch it". Only the two 2025 editions should ever
hold a value.

## Never both

A project has observed rows or a declared total, never the two for the same
window. If both existed, every screen would have to choose one and no screen
could sum them: the total already includes whatever the rows describe, so adding
them double counts, and preferring one silently discards the other.

The loader refuses to write a row for a project that already has `registros`,
`encuestas` or `grupos` inside `[desde, hasta]`, and says which. It applies the
same rule to `vip` against `acs_ventas_diarias`: a project with mirrored ACS
sales in the window cannot also declare a VIP total. Notion cannot be checked
that way — it is not in this database — so that one is on whoever runs the
runbook's §1.2. A project that
starts receiving live data mid-window is the one case that needs a human
decision: shorten `hasta` to the day before the live data starts, or drop the
historical row.

## Readers

- **The project dash** (`/proyectos` → dash tab). Shows the historical figures
  **only when its date range covers `[desde, hasta]` entirely**, labelled as
  historical and with no daily breakdown, no origin split and no Lead Score. On a
  narrower range it says so rather than showing a fraction of a total it cannot
  fraction.
- **Nothing else, on purpose.** These metrics stay out of `METRICS_CATALOG` and
  out of `Metricas` views: both promise a per-day series that folds over an
  arbitrary range, and a launch total does not fold. Same rule that keeps
  `telefonos_unicos` out of the catalogue.

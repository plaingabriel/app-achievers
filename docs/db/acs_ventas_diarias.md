# `acs_ventas_diarias` contract

Daily sales mirrored from **`achievers-comercial-system`** (ACS, the sales
platform on Supabase). Unlike `error_log` and `meta_ads_diarias`, the writer here
is **the dashboard itself** — see "Writer" for why it cannot be the Express
server.

## Two tables, because the source has two grains

`public-project-metrics` answers, per day, money per **currency**
(`ventas_por_dia[].facturacion_por_moneda`) and counts per **product**
(`ventas_por_dia[].ventas_por_producto`). The daily product breakdown carries no
amounts at all. Folding both into one table would mean inventing per-product
revenue that the endpoint never reported, so there are two.

`src/db/schema/app.ts` is the source of truth; migration `0012_acs_ventas_diarias`.

### `acs_ventas_diarias` — money, per project / day / currency

| Column | Type | Notes |
|---|---|---|
| `id` | bigint auto | |
| `proyecto_id` | bigint | FK → `proyecto.id`, `ON DELETE CASCADE` |
| `dia` | date | cut in `America/Montevideo`, never a timestamp |
| `modalidad` | varchar(100) | `modalidades.codigo` in ACS, as sent in `projectCode` |
| `edicion` | varchar(36) | `ediciones.id`, or `''` — see below |
| `moneda` | varchar(3) | as ACS reported it |
| `ventas` | bigint | sales **opened** that day (a payment with no `cuota_id`) |
| `cobros` | bigint | every completed payment, instalments included |
| `valor_vendido` | decimal(14,2) | price of what was sold, collected whenever |
| `facturacion` | decimal(14,2) | money that actually came in |
| `created_at`, `updated_at` | timestamp | `updated_at` is `ON UPDATE CURRENT_TIMESTAMP` |

`UNIQUE (proyecto_id, dia, moneda)`, plus an index on `(proyecto_id, dia)`.

### `acs_ventas_producto_diarias` — counts, per project / day / product

| Column | Type | Notes |
|---|---|---|
| `proyecto_id`, `dia`, `modalidad`, `edicion` | | same meaning as above |
| `producto_id` | varchar(36) | `productos.id` in ACS: a UUID, not the `int` in `sells` |
| `producto_nombre` | varchar(255) | denormalised on purpose — no view can resolve it |
| `ventas` | bigint | sales opened that day for that product |

`UNIQUE (proyecto_id, dia, producto_id)`, plus an index on `(proyecto_id, dia)`.

**`ventas` and `cobros` are stored separately and never derived from each other.**
On `evergreen` they differed by 155 (693 vs 848) when this was measured on
2026-09-05. A day whose only activity was an instalment of an earlier sale has
`ventas = 0`, `cobros > 0` and **no row at all** in the product table — the
backfill of project 4 produced four such days. That asymmetry is the reason
`cobros_acs` does not offer a product breakdown: a instalment does not say which
product opened the sale.

## `edicion = ''` means "the whole modalidad"

`proyecto.sales_edition_id` is deliberately optional (a modalidad like
`evento_presencial` uses "editions" that are event types, not runs, so requiring
one would force a meaningless choice). When it is empty the ingest asks for the
modalidad and stores `''` — **not** NULL, so `GROUP BY` in the views needs no
NULL handling and the value reads as a state rather than a gap.

Treat `''` as *unscoped*, never as a missing label. Measured on project 4 before
its edition was set: 1.718.560,55 USD attributed to it, against the 56.133,00
that were actually its edition's — the rest belonged to Mayo 2026. Thirty times
over.

**Neither `modalidad` nor `edicion` is part of any unique key**, and that is
deliberate. A project declares one modalidad and at most one edition at a time,
so they are labels of the row, not its identity. With the edition in the key,
re-pointing a project at another edition would leave the old rows in place and
every sum over that project would count the same day twice. Keyed on the project,
a re-read overwrites.

## Writer

**The dashboard**, `src/server/acs-ventas-ingest.ts`, run by the in-process cron
in `src/server/cron.ts` every three hours at `:20` UTC. Manual runs and backfills
go through `scripts/acs-ventas-ingest.ts`, which takes a number of days.

It **cannot** be `server-achievers`. That repo has no access to ACS's Supabase —
not a single reference to it — so the dashboard is the only process that reaches
both sides. Evergreen is where the two systems meet; nothing else becomes a
client of ACS.

Per project with `proyecto.sales_project_code` set, it calls
`public-project-metrics` with `groupBy=dia`, `incluir=dias`,
`zona=America/Montevideo` and `edicionId` when the project declares one.

Four rules the writer enforces:

1. **A trailing 7-day window, re-read whole on every pass.** A day is not final
   when it ends: `lanzamiento` reported 2919 sales and 2923 a few minutes later
   on 2026-09-05, and a refund removes a sale already counted.
2. **DELETE + INSERT over that window in one transaction, not an upsert.** A
   refund or a soft delete makes a day *stop being reported*; an upsert-only pass
   would leave the stale row for ever. This is the difference from
   `meta_ads_diarias`, whose source never withdraws rows.
3. **Refuses to write when `meta.lectura.completo` is `false`.** PostgREST caps
   at 1000 rows and ACS pages around it; a partial read produces a total that
   looks sane and is not. `lanzamiento` alone reads 2930 rows.
4. **Refuses to write when the `meta.filters.edicionId` echo does not match.** An
   endpoint that ignored the parameter would answer the whole modalidad —
   measured at 41 % above the edition — and we would store it labelled as that
   edition.

### The deleted range is wider than the window asked for

ACS **filters** by timestamp (`fecha_pago.gte.<dateStart>T00:00:00`, effectively
UTC) but **buckets** the day in `America/Montevideo`, three hours behind. A
payment at 01:00Z on `dateStart` passes the filter and lands in the *previous*
day's bucket: a window starting 2026-08-29 came back with a 2026-08-28 row on the
first run.

So the ingest deletes the union of the window it asked for and the days it was
actually answered. Deleting only `[dateStart, dateEnd]` would leave that row
behind and the next pass would hit the unique key and roll the whole project
back, every time. **Do not "fix" this by narrowing the range** — the skew is
structural, not a bug someone will correct on the other side.

## Reader

`Metricas`.`v_acs_ventas_diarias` and `v_acs_ventas_producto_diarias`
(`scripts/metrics-views.sql`), declared read-only in `src/db/metrics-views.ts`
and served by `/api/public/proyectos/:id/series` through `METRICS_CATALOG`:

| Metric | Unit | `agrupar=` |
|---|---|---|
| `ventas_acs` | cantidad | `producto` |
| `cobros_acs` | cantidad | — |
| `facturacion_acs` | usd | — |
| `valor_vendido_acs` | usd | — |

The dashboard never writes through the views, and the series endpoint never calls
ACS: an HTTP hop inside it would put a third party in the path of an endpoint
that today can only fail on its own database
(`docs/runbooks/metrics-db-user.md` §6).

`agrupar=edicion` is **not** offered. Inside one project the edition is a
constant — the project *is* the edition — so the breakdown would always return a
single line. The consequence is that the panel has no way to know which edition a
series belongs to; the place to fix that is `/api/public/proyectos`, which lists
projects and could carry `modalidad` and `edicion` beside the name.

## Currency

The money metrics sum **only `moneda = 'USD'`**. All 3.892 sales in ACS were USD
when measured on 2026-09-05 and USD is the agreed unit, but the mirror stores the
currency it was told: adding a peso row into a dollar total is exactly the kind of
number that looks fine and means nothing. A sale in another currency stays visible
in the view and absent from the series — the honest half of the trade.

`meta_ads_diarias.inversion` is USD by convention with no column to say so, so a
ROAS built from both is comparing like with like only as long as that holds.

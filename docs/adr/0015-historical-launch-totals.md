# ADR 0015 — Past launches stored as aggregate totals, never as synthetic rows

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

Launches that ran before this dashboard existed left no row-level data: no
`registros`, no `encuestas`, no `grupos`. What survives is a handful of totals
per launch — leads registered, surveys answered, people added to WhatsApp
groups — and those numbers should sit next to the launches the dashboard did
record, instead of showing an empty dash for every past edition.

VIP is a different problem and measuring it three ways was the only way to see
it. On 2026-09-07, ACS (2024-01-01 → 2026-12-31) and the Notion database
**VENTAS ACHIEVERS ACADEMY** answered:

| Launch | ACS | Notion | Source |
|---|---|---|---|
| Abril 2025 | 0 | 0 | nowhere — hand-typed or nothing |
| Octubre 2025 | 0 | 0 | nowhere — hand-typed or nothing |
| Mayo 2026 | 1 VIP (+844 Importador PRO) | **2.120 VIP** | Notion, per day |
| Septiembre 2026 | 2.275 VIP | 0 | ACS, per day |

So VIP has **three** possible homes depending on the launch, and only the last
row is the case everyone assumed. The 2.120 Notion pages run 2026-04-01 →
2026-06-26 across 42 distinct days, every one of them `Status = "Pago Completo"`:
a real daily series, not a total. Only the two 2025 launches have nothing
anywhere. Detail and the recoverable reader in `docs/ventas-vip.md`.

The tempting move is to synthesize rows: write N invented `registros` for a past
launch and every consumer downstream — the dash aggregates, the daily chart, the
`Metricas` views, the Lead Score — keeps working with no code touched.

## Decision

Past-launch totals go in a new app-owned table, **`metricas_historicas`**: one
row per project, carrying the launch window (`desde`, `hasta`) and one column per
metric (`registros`, `encuestas`, `grupos`, and `vip` only when **neither ACS nor
Notion** has the launch — as measured, only Abril 2025 and Octubre 2025).
Migration `0014`. Contract in
`docs/db/metricas_historicas.md`; loading procedure in
`docs/runbooks/backfill-lanzamientos.md`.

**No invented row is ever written into `registros`, `encuestas` or `grupos`.**
Those tables hold observed records only.

Two rules follow from the grain, and they are part of the decision:

- **A total is not attributable to a day.** The dash shows a historical figure
  only when its date range covers `[desde, hasta]` whole; on any narrower range
  it says the launch is historical and has no daily breakdown. It never
  distributes, prorates or pins the total to a date.
- **These metrics do not enter `METRICS_CATALOG`.** That catalogue's contract is
  a per-day series the external panel folds with `agregacion`; a launch total
  cannot be folded over an arbitrary range. This is the same exclusion, for the
  same reason, that already keeps `telefonos_unicos` out of it
  (`src/lib/proyectos-registros-api.ts`).

## Consequences

- **Synthetic rows are rejected, and this is the record of why.** `registros`
  requires `nombre` and `correo`, so the cheap version means inventing thousands
  of fake identities; they would then flow into the unique-email total, the
  origin distribution, the `encuestas` CSV export and the Lead Score average,
  each of which would report a number that looks sane and is fabricated. And no
  column would say which rows were invented — adding one costs the same as this
  table while keeping all of the pollution. The next person to propose this
  should read this paragraph first.
- **Consumers now sum two sources.** Any screen showing a project's leads has to
  decide whether it is reading observed rows, a declared total, or both, and say
  which. That cost is accepted: it is visible at every call site, whereas mixed
  rows would be invisible at all of them.
- **Adding a fifth historical metric costs a migration.** Accepted. The set is
  small and closed, and the narrow `(metrica, valor)` alternative would admit a
  misspelled metric name and force a pivot into every query.
- **`vip` has three possible homes and that is the price of this split.** ACS
  for Septiembre 2026, Notion for Mayo 2026, this table for the two 2025
  launches. Whoever reads a VIP figure has to know which, and a launch may need
  two sources at once: Mayo 2026's course sits in ACS while its VIP sits in
  Notion. The alternative — typing every launch's VIP by hand for uniformity —
  would throw away two daily series that can be fetched, and let a typed number
  drift from sources that are still live.
- **The Notion series cannot be mirrored into `acs_ventas_diarias`.** That
  ingest does DELETE + INSERT over the window it reads, so Notion-sourced rows in
  April–May 2026 would be silently wiped by the next `acs-ventas-ingest.ts 400`.
  If those 2.120 sales are ever mirrored, it is into their own table. That
  decision is not made here.
- The frozen tables (`Calendarios`, `Closers`, `Personas`) are untouched; this is
  a new app-owned table, so ADR 0008 (schema ownership) applies unchanged.

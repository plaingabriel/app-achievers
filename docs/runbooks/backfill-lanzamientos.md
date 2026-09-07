# Runbook — backfill a past launch

How to make a launch that ran before this dashboard existed show real numbers
instead of an empty dash: leads registered, surveys answered, people added to
WhatsApp groups, and VIP entries.

The four metrics do **not** travel together. Three are always typed in by hand,
because nothing holds them any more. VIP is different: it lives in ACS, or in
Notion, or nowhere, depending on the launch — and a launch can have its course in
one and its VIP entrance in the other. Do VIP first: §1 is two requests and it
tells you which of the three cases you are in.

Decision: [ADR 0015](../adr/0015-historical-launch-totals.md); table contract:
[`docs/db/metricas_historicas.md`](../db/metricas_historicas.md).

> **The three past launches are not projects yet.** Measured on 2026-09-07, the
> database holds three projects — *WORKSHOP JULIO 2026* (2), *[0926] Lanzamiento
> - Desafio Importador* (4) and *Prueba Lanzamiento* (5). Abril 2025, Octubre
> 2025 and Mayo 2026 exist as **ACS editions**, not as rows in `proyecto`. Create
> the project first (**Proyectos → Añadir proyecto**), then follow this runbook;
> there is nothing to attach a historical row to otherwise.

## Before anything

- **Know the launch window.** One `desde` and one `hasta`, calendar days. Every
  step below depends on it and a wrong window makes every figure wrong in a way
  nothing later will catch.
- **Take a backup.** `pnpm db:backup`. Dev connects to production `Evergreen`
  through the SSH tunnel (ADR 0010) and this runbook writes to it.
- **Never `pnpm db:push`.** Migrations only, `pnpm db:migrate`.

### About `grupos`, before you type a number

Whatever figure you load for `grupos` is an **entry count**, not membership. The
dashboard now records exits too ([ADR 0016](../adr/0016-grupos-event-log.md)), but
only from the day SendFlow started sending them — which is after every launch this
runbook covers. If Woker's source reports both, use entries, so the historical row
means the same thing as the "Entradas a grupos" figure beside it. Never load a
participants figure here: the dash would show it next to entries under a label
that does not mean that.

## 1. VIP entries — ask both sources before typing anything

VIP lives in one of three places depending on the launch, and the obvious
assumption ("recent launch, so it is in ACS") is wrong for one of them. Ask ACS,
then Notion, and only then reach for a keyboard.

### 1.1 Ask ACS — for the VIP product, not for the launch

```bash
set -a && . ./.env && set +a
curl -s -H "x-api-key: $SALES_METRICS_API_KEY" \
  "$SALES_METRICS_URL?projectCode=lanzamiento&edicionId=<UUID>&dateStart=2024-01-01&dateEnd=2026-12-31&incluir=productos"
```

`?modalidades=1` on the same endpoint lists every modalidad with its editions and
their UUIDs. The four `lanzamiento` editions, read on 2026-09-07:

| Edition | `edicionId` |
|---|---|
| Abril 2025 | `f530ef17-72ba-4a80-b94f-18f546f5e4f0` |
| Octubre 2025 | `69b0cbd1-25b2-41ba-bd75-2799f5443231` |
| Mayo 2026 | `bd5a2f75-237f-4a5e-a285-ab6e3ccd0cfa` |
| Septiembre 2026 | `8badceac-b006-475c-b96b-198ded505ee2` |

Read `data.metricas.ventas_por_producto` and look **at the VIP line
specifically**:

- **A plausible VIP count for the whole launch** → ACS is the source. Go to §1.3
  and leave `vip` empty in §2.
- **No VIP line, or a number far too small for the launch** → go to §1.2. ACS may
  hold the course and not the entrance.

**A non-empty answer is not proof.** Measured on 2026-09-07, Mayo 2026 returns 844
Importador PRO **and 1 VIP** — while Notion holds 2.120 VIP for the same launch.
Reading "ACS has this edition" off the 844 would have lost 2.119 sales. The four
editions: Abril 2025 → nothing, Octubre 2025 → nothing, Mayo 2026 → 844 PRO + 1
VIP, Septiembre 2026 → 2.275 VIP. Re-read later the same day, Septiembre 2026
answered 2.330: it is the live launch and still selling, so treat its figure as a
reading with a timestamp, not a constant.

### 1.2 Ask Notion

The VIP entrance was sold through the **VENTAS ACHIEVERS ACADEMY** Notion
database until `achievers-comercial-system` took over, and that only happened for
Septiembre 2026. The database is still live. Credentials are the server's
(`NOTION_TOKEN_VENTAS_ACHIEVERS`, `NOTION_DB_ID_VENTAS_ACHIEVERS`), not this
repo's; the reader is recoverable from `server-achievers` history. Code, filter
and caveats: [`docs/ventas-vip.md`](../ventas-vip.md), "Dónde está el VIP de cada
lanzamiento".

Filter on `Producto Adquirido contains "Entrada VIP - Desafio Importador"` —
**the Notion spelling: plain hyphen, no accent**, not the ACS one — and read
`Fecha de Compra`.

Measured on 2026-09-07 over the whole database: **2.120 pages, 2026-04-01 →
2026-06-26, 42 distinct days, every one `Status = "Pago Completo"`**, 100 % with
`Email` and 99 % with `Telefono`. Nothing before 2026-04-01 — so neither 2025
launch is in there either.

- **Pages in the launch window** → it is a daily series, not a total. It does
  **not** go in `metricas_historicas`, and it **cannot** be mirrored into
  `acs_ventas_diarias`: that ingest does DELETE + INSERT over the window it
  reads, so the next `acs-ventas-ingest.ts 400` would wipe the rows. Storing it
  needs its own table, which is not designed yet — until then the figure stays
  where it is and the dash reads it live, as the first version did.
- **Nothing there either** → now, and only now, VIP is a hand-typed total.
  Continue to §2. As measured, this is Abril 2025 and Octubre 2025 only.

### 1.3 ACS is the source — wire the project up and pull the days

The project needs its sales link configured
(**Proyectos → Editar proyecto → Ventas VIP**): `sales_project_code`,
`vip_product_id`, and `sales_edition_id` if the modalidad has editions. The full
procedure, including how to find each value, is in
[`docs/ventas-vip.md`](../ventas-vip.md).

**Set `sales_edition_id`.** Without it the figures cover the whole modalidad and
the card does not say so. Measured on project 4 on 2026-09-05: 1.718.560,55 USD
against the 56.133,00 that were actually its edition's.

Then reach back far enough to cover the launch:

```bash
pnpm exec tsx --env-file=.env scripts/acs-ventas-ingest.ts 400
```

The argument is a number of days back from today, so pick one that clears
`desde` with room to spare. The ingest deletes and re-inserts the window whole
inside a transaction, so running it twice over the same range is safe and running
it too wide only costs time.

Check the run wrote something: the project dash's VIP card should show the
launch's sales for its date range, and `acs_ventas_diarias` should hold rows
between `desde` and `hasta`. If it refuses to write, the reason is one of the
four guards in [`docs/db/acs_ventas_diarias.md`](../db/acs_ventas_diarias.md) —
read the message before retrying, none of them are fixed by running it again.

## 2. Leads, surveys and groups — typed once, from a named source

### 2.1 Get the numbers, and get where they came from

Three totals over `[desde, hasta]`, plus VIP only if §1.1 **and** §1.2 both came
back empty. Whatever Woker hands over — a sheet, an old export, a screenshot —
**write down what it was** in enough detail that someone
else could find it again: the file, the tab, the date it was exported. That
sentence goes in `fuente` and it is the only thing that will ever let anyone
audit these figures. A metric with no figure stays empty; it will show as unknown
rather than as zero, which is the honest reading.

### 2.2 Check the project is actually empty for that window

The loader refuses a project that already has `registros`, `encuestas` or
`grupos` inside the window, because a declared total and observed rows describing
the same days cannot be added and cannot be chosen between (see "Never both" in
the table contract). If it refuses, the fix is a decision, not a retry: shorten
`hasta` to the day before live data starts, or drop the idea of a historical row
for that project.

### 2.3 Enter them

**Proyectos → seleccionar el proyecto → Editar proyecto → bloque Histórico.**
Window, the three totals, the source. Save.

### 2.4 Verify

Open the project dash and set its range to exactly `[desde, hasta]`. The three
figures must match what you typed, and the dash must label them as historical
with no daily chart. Then narrow the range by a day: the figures must disappear
behind the historical notice, **not** shrink. A total that changes with the range
means it is being prorated, which ADR 0015 forbids — stop and report it.

## Correcting a load

Re-open the same block and overwrite; there is one row per project and saving
replaces it. Deleting the row removes the history entirely and the dash goes back
to empty. Neither touches `registros`, `encuestas` or `grupos`, which this
procedure never writes.

VIP is corrected differently: fix the sales link on the project, then re-run the
ingest over a range covering the launch. It rewrites the days it re-reads.

## Traps

- **The window is inclusive on both ends.** A launch that closed on the 31st has
  `hasta = 2026-05-31`, not the 1st of June. The VIP ingest cuts days in
  `America/Montevideo`, so a launch that closed at night is not split in two.
- **Do not backfill a launch that has real data.** If the dashboard recorded it,
  it does not need this runbook, and a total on top of it double counts.
- **Do not try to make these appear in the external metrics panel.** They are
  deliberately absent from `METRICS_CATALOG` and from the `Metricas` views: that
  contract is a per-day series, and a launch total cannot be folded over an
  arbitrary range.
- **`fuente` is required.** A row without a traceable origin is a number nobody
  can defend the first time it is questioned.

# ADR 0016 — `grupos` is an event log, not a membership list

- **Status:** Accepted
- **Date:** 2026-09-07

## Context

`grupos` holds one row per person added to a WhatsApp group, written by the
SendFlow sendhook (`docs/db/ingesta-publica.md`). It has never recorded anyone
leaving, so it answers "how many entered" and is read everywhere as "how many are
in" — including as the denominator of the VIP conversion rate.

Measured on 2026-09-07 for *[0926] Desafío Importador*: SendFlow reports 100.849
entries, 22.741 exits and 79.196 current participants; `grupos` holds 100.655
rows and cannot produce the third figure. The dashboard overstates group
membership by roughly a quarter and understates VIP conversion by the same
distortion.

SendFlow does emit the exit event. Both events post to the same URL with an
identical `data` object and differ **only** in a top-level `event` field
(`group.updated.members.added` / `…removed`), which `createGrupo` does not read.
Ticking "Miembro removido" today would therefore file exits as entries. It has
never been activated (confirmed 2026-09-07), so the table is consistent: every
row in it is an entry.

A person can also leave and re-enter, so the state is not a flag on a row.

## Decision

`grupos` becomes an append-only **event log**. Migration `0013` adds:

- **`evento`** — `'entrada' | 'salida'`, derived from the payload's `event`
  suffix. Existing rows are backfilled to `'entrada'`: until now the hook only
  carried the added event.
- **`evento_id`** — the payload's top-level `id`, **UNIQUE**. A redelivered
  sendhook is ignored instead of counted twice. Nullable, because rows written
  before this migration and rows created by hand through the admin have no such
  id; the unique constraint ignores NULLs in MySQL.

**An unrecognised `event` value is rejected with 400.** It is not treated as an
entry. Defaulting is exactly how exits would have become entries, and a sendhook
that starts sending a third event should break loudly, not quietly miscount.

Membership is derived, never stored: a phone is in a group when its `entrada`
count for that `(telefono, grupo)` exceeds its `salida` count. `grupos` keeps
every event; no row is ever updated or deleted to reflect a departure.

## Consequences

- **"Leads en grupos de WSP" changes meaning and will drop.** What was an entry
  count becomes current membership wherever the reading is "who is in". Every
  consumer must be revisited: the dash totals, `COBERTURA EN GRUPOS`, the
  `Metricas` views (`v_grupos_por_campana`), the `grupos` metric in
  `METRICS_CATALOG`, and the VIP denominator. A screen showing entries and a
  screen showing membership must both say which one they mean.
- **The VIP conversion rate will rise**, because its denominator stops counting
  people who left. This is a correction, not a regression; say so when it moves.
- **The backfill is unambiguous**, and only because the event was never enabled:
  every existing row is an entry, so `evento = 'entrada'` is a fact, not an
  assumption. Had it been on for even a day, those rows would be unrepairable —
  the two payloads differ only in the field that was not stored. The event stays
  off until this ships.
- History is one-sided: exits are only known from the day the event is enabled.
  Membership computed over an earlier range is still an entry count, and the dash
  must not present it as anything else.
- `evento_id` makes the endpoint idempotent for the first time. Retries stop
  moving the numbers.

# Phase 08 — Data management — full CRUD on every table

## Goal
Generic, RBAC-gated CRUD over Personas, Closers, Calendarios (and future tables).

> **"Frozen" means schema-frozen, NOT read-only.** Personas, Closers and
> Calendarios get **full data CRUD** through this UI — create/edit/delete rows
> is a normal, everyday operation. What's frozen is their **structure**: the
> dashboard never authors `ALTER`/`DROP` migrations against them (enforced by
> the `schema`/`tablesFilter` config in `drizzle.config.ts`). Two separate ideas
> — see `docs/db/ownership.md`. Do not skip or gate these tables' row CRUD.

## Batch (small, do in order)
1. Build list + edit + create + delete views per table, in Spanish, using the kit Table.
2. Wire writes through Drizzle. Row writes (INSERT/UPDATE/DELETE) on the frozen
   tables are allowed and expected; only schema migrations against them are off-limits.
3. Audit destructive actions; confirm dialogs on delete.

## Files
`src/routes/personas/*, src/routes/closers/*, src/routes/calendarios/*, src/components/Table.tsx`

## How to validate
- An editor edits a Persona row and the change persists in Evergreen.
- Delete is blocked for non-admins; allowed (with confirm) for admins.
- `activo`/`setter` booleans render and toggle correctly (tinyint(1) mapping).

# Phase 08 — Data management — full CRUD on every table

## Goal
Generic, RBAC-gated CRUD over Personas, Closers, Calendarios (and future tables).

## Batch (small, do in order)
1. Build list + edit + create + delete views per table, in Spanish, using the kit Table.
2. Wire writes through Drizzle; respect frozen-schema (data only).
3. Audit destructive actions; confirm dialogs on delete.

## Files
`src/routes/personas/*, src/routes/closers/*, src/routes/calendarios/*, src/components/Table.tsx`

## How to validate
- An editor edits a Persona row and the change persists in Evergreen.
- Delete is blocked for non-admins; allowed (with confirm) for admins.
- `activo`/`setter` booleans render and toggle correctly (tinyint(1) mapping).

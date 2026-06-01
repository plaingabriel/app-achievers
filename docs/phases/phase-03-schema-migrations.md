# Phase 03 — Drizzle schema + first migration

## Goal
Create the dashboard-owned tables WITHOUT touching the frozen ones.

## Batch (small, do in order)
1. Finalize schema files (auth/rbac/app). Keep existing.ts frozen.
2. `pnpm db:generate` — confirm the generated SQL contains NO DDL for Calendarios/Closers/Personas.
3. Back up (`pnpm db:backup`), then `pnpm db:migrate`.

## Files
`src/db/schema/*.ts, drizzle/ (generated), drizzle.config.ts (tablesFilter)`

## How to validate
- Generated migration references only new tables; tablesFilter excludes the 3 frozen tables.
- After migrate: `user`, `role`, `permission`, `invitation`, `audit_log`, `error_log`, … exist.
- `DESC Personas;` is byte-for-byte unchanged.

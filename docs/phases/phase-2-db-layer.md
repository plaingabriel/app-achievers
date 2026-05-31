# Phase 2 — Database layer

**Goal:** full Drizzle schema, first migration, guarded migrate runner.

**Prerequisites:** Phase 1.
**Implements:** ADR 0003, 0004, 0008, 0011.

## Tasks
- [ ] In `src/db/schema.ts`, define all dashboard-owned tables (column specs in ADR 0003/0004/0008 and `plan.md` §4): the Better Auth tables (or let Better Auth generate them in Phase 3 and reference here), `role`, `permission`, `role_permission`, `user_role`, `invitation`, `audit_log`, `error_log`. Extend `user` with `persona_id` (nullable, no FK) and `status`.
- [ ] Keep `Personas` (and add `Closers`, `Calendarios`) as introspected reference tables for typing; they are excluded from migrations via `tablesFilter`.
- [ ] Add Drizzle relations: `user.persona_id → personas.id` (app-validated), `user_role`, `role_permission`.
- [ ] Implement `scripts/migrate.ts`: print pending SQL, sleep 5s, require `--yes`, then apply. Refuse `drizzle-kit push`.
- [ ] `pnpm db:generate` → review the SQL → `pnpm db:migrate --yes` against a `staging` DB first.
- [ ] Write `docs/db/error_log.md` (the cross-repo contract) and `docs/db/ownership.md` if not already present.

## Acceptance criteria
- Migration applies cleanly to `staging`; frozen tables untouched.
- `db` client imports and a trivial `select` against `personas` returns rows.
- Guarded migrate refuses to run without `--yes`.

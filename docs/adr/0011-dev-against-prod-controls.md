# ADR 0011: Controls for developing against the production DB

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

By explicit choice, development runs against the production MySQL (no separate local DB) to keep the pipeline simple. This is risky; the risk must be contained.

## Decision

Enforced controls:
1. Per-dev MySQL users default to SELECT-only; write grants applied per-task, removed after.
2. Pre-commit hook rejects `DROP`, `TRUNCATE`, or unscoped `DELETE FROM` in committed `.sql`.
3. `pnpm db:migrate` prints the pending SQL, sleeps 5s, and requires `--yes` to apply against prod.
4. The daily backup runs before any planned migration window.
5. Never `drizzle-kit push` against prod — only generated, reviewed migrations.
6. A `staging` MySQL database on the same droplet (same instance, separate DB, free) for risky changes.

## Consequences

- Day-to-day dev is read-only by default; mistakes are hard to make accidentally.
- Slightly more ceremony around migrations — intentional.

## Alternatives considered

A true local/staging-only DB (rejected by the simplicity constraint, but `staging` reintroduces a safe sandbox at zero cost).

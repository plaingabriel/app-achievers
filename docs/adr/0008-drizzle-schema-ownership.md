# ADR 0008: Drizzle ORM + schema ownership across two repos

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Two independent repos share one MySQL: this dashboard (database-intensive) and the Express server (integration-heavy, treats the DB as one integration). Migrations need a single clear owner to avoid drift.

## Decision

Use Drizzle ORM (TypeScript-first, no codegen engine, MySQL support). **The dashboard owns the schema and all migrations.** The frozen reference tables `Personas`, `Closers`, `Calendarios` are introspected, never generated/migrated (excluded via `tablesFilter` in `drizzle.config.ts`); any change to them needs a written impact statement + both-maintainer review + coordinated Express deploy. New dashboard tables the Express server must read/write (e.g. `error_log`) ship migration-first, with the schema documented in `docs/db/` as the cross-repo contract.

## Consequences

- One source of truth for schema; low drift risk.
- The Express server consults `docs/db/` rather than sharing a package.
- Frozen-table changes are deliberately high-friction.

## Alternatives considered

Prisma (separate engine binary, slower iteration), raw SQL (no type safety), shared schema package as a third repo (overhead for two devs) — rejected.

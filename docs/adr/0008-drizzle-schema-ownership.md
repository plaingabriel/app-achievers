# ADR 0008 — Drizzle ORM + data/schema ownership split

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
Two repos share one MySQL DB. The dashboard must edit all data but must not destabilize the existing tables' structure.

## Decision
Use Drizzle. Dashboard owns migrations for its own tables. The three existing tables are declared for typed full-CRUD but are schema-frozen and excluded from migrations via tablesFilter.

## Consequences
Full data CRUD everywhere; zero risk of accidental DDL on frozen tables. Structural changes to frozen tables need explicit coordination.

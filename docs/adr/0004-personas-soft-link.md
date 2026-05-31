# ADR 0004: User ↔ Personas optional soft link

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

The existing `Personas` table (people the company tracks via Notion) has a primary key that is usually a Notion UUID but is sometimes an email. Its schema is frozen (used by the Express server). Some dashboard users (the two devs) are not Personas; some future users will be. Some people legitimately have no Notion ID.

## Decision

Add a nullable `persona_id varchar(255)` to the `user` table. **No DB-level FK** (the mixed UUID/email key makes a real FK fragile). Validate at the app layer via Drizzle relations: if set, it must point at a real `Personas` row. Dev maintainers have `persona_id = NULL`. The UI does not surface the email-as-ID rows as a data-quality warning.

## Consequences

- `Personas` is never modified.
- Tolerant of the irregular key data.
- Integrity is enforced in code, not the DB — write paths must validate.

## Alternatives considered

Strict FK (requires changing Personas / breaks on email keys), derived link via email match (brittle) — rejected.

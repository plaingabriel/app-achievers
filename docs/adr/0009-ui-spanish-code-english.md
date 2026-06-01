# ADR 0009 — UI in Spanish, code in English

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
The product audience is Spanish-speaking; the codebase is maintained in English.

## Decision
All user-facing copy is Spanish (kept in src/i18n/es.ts). All code, identifiers, comments, and docs are English. Existing Spanish table/column names stay.

## Consequences
Clean i18n boundary; reviewable. Design-system voice/casing rules apply to the Spanish copy.

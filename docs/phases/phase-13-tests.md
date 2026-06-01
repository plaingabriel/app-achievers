# Phase 13 — Tests  [LAST]

> **Order note:** this is the **last** phase. Tests are deferred until the app is feature-complete (plan §2).

## Goal
Write the test suite. Deferred until now by design (plan §2).

## Batch (small, do in order)
1. Unit: rbac resolution, email interface, i18n key completeness.
2. Integration: auth + invitations + CRUD against a throwaway DB (not Evergreen).
3. E2E: login → dashboard happy path; wire tests into CI (phase 12).

## Files
`tests/unit/*, tests/integration/*, tests/e2e/*, CI test step`

## How to validate
- `pnpm test` runs green locally.
- Integration tests use a disposable database, never production Evergreen.
- CI runs the suite on every push and blocks merge on failure.

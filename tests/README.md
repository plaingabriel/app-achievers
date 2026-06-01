# Tests (scaffold — deferred)

Tests are the **last** build phase (see `docs/phases/phase-13-tests.md`). This
folder exists so the structure is ready; no tests are written yet.

Planned layout when phase 13 begins:

```
tests/
├── unit/          # rbac resolution, email interface, i18n completeness
├── integration/   # auth flows, invitations, CRUD with a throwaway DB
└── e2e/           # login → dashboard happy path
```

Per the plan, tests are deferred but the folder is scaffolded now; add tests
before a third contributor joins.

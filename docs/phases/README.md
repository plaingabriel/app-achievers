# Build phases

Small batches, top to bottom. A phase is done only when its **How to validate** passes.
Record non-obvious choices as ADRs (`../adr/template.md`).

**The last two phases are intentionally last:** GitHub Actions is second-to-last, Tests is last.

| # | Phase | Goal |
|---|---|---|
| 00 | [Repo bootstrap & tooling](phase-00-bootstrap-tooling.md) | Get a runnable empty app with the toolchain enforced. |
| 01 | [Design system integration](phase-01-design-system.md) | Wire the Achievers brand: dark mode, JetBrains Mono, amber accent, dotted grid, assets. |
| 02 | [Database connectivity (Evergreen via tunnel)](phase-02-db-connectivity.md) | Connect Drizzle to the real Evergreen DB through the SSH tunnel and read an existing table. |
| 03 | [Drizzle schema + first migration](phase-03-schema-migrations.md) | Create the dashboard-owned tables WITHOUT touching the frozen ones. |
| 04 | [Authentication (email + password, sessions)](phase-04-auth.md) | Stand up Better Auth and the first admin. |
| 05 | [Two-factor (TOTP + backup codes)](phase-05-two-factor.md) | Add TOTP enrollment and verification at login. |
| 06 | [RBAC (roles, permissions, gating)](phase-06-rbac.md) | Resolve permissions and gate pages/features; admin UI to configure roles. |
| 07 | [Invitations (invite-only onboarding)](phase-07-invitations.md) | Invite users by email via Resend; accept to create an account. |
| 08 | [Data management — full CRUD on every table](phase-08-data-crud.md) | Generic, RBAC-gated CRUD over Personas, Closers, Calendarios (and future tables). |
| 09 | [Error-log viewer (SSE + retention)](phase-09-error-log-viewer.md) | Tail error_log live and purge old rows. |
| 10 | [Audit log (sensitive events)](phase-10-audit-log.md) | Record sensitive auth/RBAC events; enforce visibility. |
| 11 | [Operations — backups, health, PM2](phase-11-ops-backups-health.md) | Make the app operable on the droplet. |
| 12 | [CI/CD with GitHub Actions  [SECOND-TO-LAST]](phase-12-github-actions.md) | Add CI (lint/typecheck/build) and SSH deploy. NOT scaffolded earlier — do it here. |
| 13 | [Tests  [LAST]](phase-13-tests.md) | Write the test suite. Deferred until now by design (plan §2). |

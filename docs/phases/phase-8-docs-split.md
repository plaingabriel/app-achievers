# Phase 8 — Documentation split

**Goal:** retire `plan.md` into the permanent docs structure.

**Prerequisites:** decisions stable.
**Implements:** ADR 0010.

## Tasks
- [ ] Confirm ADRs 0000-0011 reflect the final decisions (they were lifted from `plan.md`).
- [ ] Move `plan.md` §3 → `docs/architecture.md` (current-state overview + the diagram).
- [ ] Move `plan.md` §7 → `docs/runbooks/` (restore, fire-drill, rotate-credentials, deploy).
- [ ] Move `plan.md` §4 detail into the relevant ADRs + `docs/db/`.
- [ ] Archive `plan.md` as `docs/adr/0000-initial-plan.md`'s linked appendix or delete once fully absorbed.

## Acceptance criteria
- No decision lives only in `plan.md`.
- `docs/README.md` indexes everything.

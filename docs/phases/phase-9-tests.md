# Phase 9 — Tests (deferred)

**Goal:** regression safety once the maintainer is comfortable with testing.

**Prerequisites:** build when asked — not before.
**Implements:** —

## Tasks (when activated)
- [ ] Pick a runner (Vitest pairs well with Vite).
- [ ] Start with the highest-risk seams: permission resolver (ADR 0003), guarded migrate (ADR 0011), invitation flow (ADR 0002), the 7-day purge (ADR 0005).
- [ ] Add a `pnpm test` script and wire it into CI after a few tests exist.

## Note
The `tests/` folder is scaffolded empty on purpose. Do not write tests until explicitly requested (per the deferred-testing decision).

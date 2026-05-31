# Phase 6 — Internal multi-step forms

**Goal:** the company's internal multi-step forms, gated by permission.

**Prerequisites:** Phase 4.
**Implements:** ADR 0003 (gating).

## Tasks
- [ ] Agree the concrete form specs with the maintainers (fields, steps, validation, target tables) — **not yet specified; gather before building.**
- [ ] Build a reusable multi-step form pattern (step state, per-step validation, review step, submit) in the design system.
- [ ] Persist via Drizzle; emit audit entries for sensitive writes only.
- [ ] Gate each form behind its resource permission.

## Acceptance criteria
- Each form validates per step and on final submit.
- Writes land in the right tables; sensitive writes are audited.
- Forms match the design system (no emoji, sentence case, brand voice).

## Open
Form specs are TBD. Capture them as a short doc in `docs/` before coding.

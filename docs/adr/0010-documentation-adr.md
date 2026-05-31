# ADR 0010: Documentation via in-repo ADRs

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Future devs need to find *why* the architecture looks the way it does, without a vendor or a build step, kept next to the code.

## Decision

ADRs in `docs/adr/` (this format), runbooks in `docs/runbooks/`, cross-repo DB contracts in `docs/db/`, current-state overview in `docs/architecture.md`, ordered build units in `docs/phases/`. Plain markdown, version-controlled with the code. ADRs are immutable once Accepted; new decisions get new ADRs that supersede old ones.

## Consequences

- No external tool, no drift, future-dev-friendly.
- PR review of a new ADR forces the discussion a single living file would absorb silently.
- `plan.md` is archived as the historical omnibus (see ADR 0000).

## Alternatives considered

Single `ARCHITECTURE.md` (loses history), docs site like Docusaurus (maintenance overhead for two devs — revisit if needed), GitHub Wiki / Notion (separate from code, drift, lock-in) — rejected.

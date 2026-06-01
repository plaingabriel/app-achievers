# ADR 0012 — Documentation strategy — ADRs + repo markdown

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
Future devs/agents need to find why the architecture looks the way it does.

## Decision
Keep ADRs in docs/adr/ plus the markdown we already have (plan, phases, runbooks, db). No external docs site.

## Consequences
Everything lives with the code; no drift, no lock-in, no build step. ADRs are immutable once accepted.

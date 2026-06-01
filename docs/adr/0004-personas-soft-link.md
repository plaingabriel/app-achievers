# ADR 0004 — Personas soft-link (Option A)

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
A dashboard user may also be a Persona. Personas.id mixes UUIDs and short emails (e.g. fothyb@gmail.com).

## Decision
Add nullable `user.persona_id` (varchar) as a soft link with NO DB FK; treat Personas.id as opaque. App-level relation only.

## Consequences
No constraint breakage from mixed ID formats. Maintainers have persona_id = NULL. Validation is app-level.

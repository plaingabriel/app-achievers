# ADR 0006 — pnpm 11 (forced) + Biome

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
Consistent installs and one lint/format tool, no ESLint/Prettier sprawl.

## Decision
Force pnpm 11 via `packageManager` + `only-allow pnpm` preinstall. Use Biome for lint+format with one config.

## Consequences
CI uses `--frozen-lockfile`. Pre-commit runs Biome via lefthook. Do not install ESLint/Prettier.

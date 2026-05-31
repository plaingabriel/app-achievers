# ADR 0006: pnpm 11 (forced) + Biome (no ESLint/Prettier)

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Two-dev team wants one consistent, fast toolchain and a single package manager enforced across machines and CI. The droplet already has corepack enabled (the Express server also uses pnpm).

## Decision

pnpm v11, forced: `"packageManager": "pnpm@11.x.x"` + a `preinstall` running `only-allow pnpm`. Lint and format with Biome only — ESLint and Prettier are not installed. Pre-commit via lefthook runs `biome check --write` on staged files.

## Consequences

- `npm`/`yarn` are rejected at install time.
- One tool, one config (`biome.json`), faster than ESLint+Prettier.
- Coexists with the Express server: each repo has its own `packageManager`; the pnpm store is shared (content-addressable), no conflict.
- Pin the exact pnpm patch with `corepack use pnpm@11`.

## Alternatives considered

ESLint + Prettier (two tools, slower, more config), npm/yarn (not enforced single manager) — rejected.

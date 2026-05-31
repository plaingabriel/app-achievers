# Phase 1 — Scaffold

**Goal:** a running TanStack Start app with tooling enforced and the design tokens loading.

**Prerequisites:** none.
**Implements:** ADR 0001 (TanStack Start), 0006 (pnpm/Biome), 0010 (docs).

## Tasks
- [ ] `corepack use pnpm@11` to pin the exact pnpm patch + hash into `package.json`.
- [ ] `pnpm install`.
- [ ] `pnpm dev` and confirm the placeholder home route renders on the dotted-grid background in JetBrains Mono.
- [ ] Verify `src/routeTree.gen.ts` is generated (it's gitignored) and the app type-checks: `pnpm typecheck`.
- [ ] Run `pnpm check` (Biome) clean.
- [ ] Confirm `npm install` is rejected by the `only-allow` guard.
- [ ] `lefthook install` (via `pnpm prepare`) and confirm the pre-commit hook fires.
- [ ] Reconcile any drift against https://tanstack.com/start/latest/docs/framework/react/build-from-scratch — if a framework file differs, trust the docs and note it.

## Acceptance criteria
- `pnpm dev` serves at :3000 with the Achievers look (dark, mono, amber, grid).
- `pnpm build` succeeds.
- `pnpm typecheck` and `pnpm check` pass.

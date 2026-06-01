# Phase 00 — Repo bootstrap & tooling

## Goal
Get a runnable empty app with the toolchain enforced.

## Batch (small, do in order)
1. Enable corepack, install with pnpm 11 (`only-allow pnpm` must block npm/yarn).
2. Confirm Biome config, tsconfig (strict), Vite + TanStack Start plugin order.
3. Boot the app: `__root.tsx` + a hello `index.tsx` render; route tree generates.

## Files
`src/router.tsx, src/routes/__root.tsx, src/routes/index.tsx, vite.config.ts, biome.json, tsconfig.json, package.json`

## How to validate
- `pnpm install` succeeds; `npm install` is rejected by the preinstall guard.
- `pnpm dev` serves http://localhost:3000 and `src/routeTree.gen.ts` appears.
- `pnpm check` (Biome) and `pnpm typecheck` both pass on the empty app.

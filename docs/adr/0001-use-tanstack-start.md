# ADR 0001 — Use TanStack Start

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
We need a single-program React app (no split FE/BE), self-hostable on any Node host, team-familiar.

## Decision
Use TanStack Start (React 19), pinned exactly to `@tanstack/react-start@1.168.18`,
with `@tanstack/react-router` and `@tanstack/router-plugin` pinned to the matching
`1.170.10` / `1.168.13` that react-start declares. One program, Vite-plugin setup.

## Consequences
One process to run under PM2. RC status means we pin exactly and read changelogs before upgrading (plan §9). No RSC on day one.

## Drift notes
- **2026-05-31 — pinned `1.168.14` shipped an incoherent dependency tree.** A
  floating `@tanstack/react-router@^1.168.0` resolved to `1.170.10` while
  react-start internally pinned `1.170.8`, producing two router copies and a
  stale `react-start-server@1.167.9`. At request time the SSR handler threw
  `serverSsr.reserveStreamFastPath is not a function` (a 500). Fixed by bumping
  to `@tanstack/react-start@1.168.18` and pinning `react-router` exactly to
  `1.170.10` (react-start's own pin) and `router-plugin` to `1.168.13`,
  collapsing the app to a single router copy. Confirms the RC-drift risk:
  transitive `start-*`/`router-*` packages move independently of the pinned
  meta-package, so router-family deps must be pinned exact, not caret/tilde.
- **2026-05-31 — router-entry export renamed `createRouter` → `getRouter`.** The
  server handler resolves the router entry (`src/router.tsx`) by calling
  `getRouter`. The old `createRouter` export caused a 500
  (`entries.routerEntry.getRouter is not a function`). Fixed to export
  `getRouter`; the `Register` interface now references `ReturnType<typeof getRouter>`.
- **2026-05-31 — `~` alias must be wired in `vite.config.ts`.** Vite does not
  read tsconfig `paths` natively; the non-existent `resolve.tsconfigPaths`
  option left `@/*` unresolved (`Cannot find module '@/styles/app.css?url'`).
  Fixed with an explicit `resolve.alias` mapping `~` → `./src`.

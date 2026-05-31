# ADR 0001: TanStack Start as the meta-framework

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Need a fullstack-in-one React framework that runs as a plain Node process anywhere (no-lock-in), with first-class TypeScript and server functions. React is mandated by team familiarity.

## Decision

Use TanStack Start, pinned to the exact version **`1.168.14`** (no caret/tilde). It is at v1 Release Candidate: feature-complete with a stable API, but RC iterations may still ship breaking changes.

## Consequences

- Vendor-neutral, Vite-powered, type-safe routing and server functions.
- **Version policy:** pin exact. Read the changelog (https://github.com/TanStack/router/releases) before any upgrade; never upgrade on a Friday; upgrade monthly if changelogs are quiet, immediately for security advisories. Re-evaluate the pin policy when 1.0 ships.
- `verbatimModuleSyntax` must stay **false** — enabling it can leak server bundles into the client.
- Don't adopt React Server Components on day one (lands as a non-breaking v1.x addition).

## Drift notes

- **2026-05-31 — router-entry export renamed `createRouter` → `getRouter`.** Although `@tanstack/react-start` is pinned to `1.168.14`, its transitive `start-server-core` resolved to `1.169.4`, which renamed the convention the server handler expects from the router entry (`src/router.tsx`). The old `createRouter` export caused a 500 at request time (`entries.routerEntry.getRouter is not a function`). Fixed to export `getRouter` per the current [build-from-scratch docs](https://tanstack.com/start/latest/docs/framework/react/build-from-scratch); the `Register` interface now references `ReturnType<typeof getRouter>`. Confirms the RC-drift risk above — transitive `start-*` packages can move ahead of the pinned meta-package.

## Alternatives considered

Next.js (community size, but Vercel drift), React Router v7 (excellent, lost on type-safety + neutrality).

# Agent context â€” Achievers App

Read this first, then `docs/`. This file orients any coding agent working here.

## What this is
Internal admin dashboard (TanStack Start + Drizzle + Better Auth) over the
`Evergreen` MySQL database. See `docs/Achievers_App_Plan.md` for the full plan.

## The server
There is a separate, pre-existing Node/Express server (`server-achievers`)
co-hosted on the same droplet. Its public URL is **`https://server.achieversacademy.es`**.
For now **every request the dashboard sends to the server uses this prod URL â€”
even in dev** (there is no local/dev server URL yet). The URL lives in one
place: `SERVER_URL` in `src/lib/env.ts` (defaults to the prod URL); never
hard-code it elsewhere. The server also writes to `error_log`
(`emitter='express-server'`) â€” see `docs/db/error_log.md`.

## Where context lives
- `docs/Achievers_App_Plan.md` â€” the master plan (source of truth).
- `docs/adr/` â€” Architecture Decision Records (numbered, immutable once accepted).
- `docs/phases/` â€” the staged build plan. Work one small batch at a time and
  follow each phase's **"How to validate"** before moving on.
- `docs/db/` â€” schema ownership + the `error_log` cross-repo contract.
- `docs/runbooks/` â€” backup/restore, fire drill, credential rotation.
- `.claude/skills/achievers-design/` â€” the **design system as a skill**. Use it
  for any UI work. Its `preview/` HTML and `ui_kits/admin/` are the rendered
  code reference; tokens are mirrored into `src/styles/tokens.css`; brand assets
  are served from `public/assets/`. **Implementation:** the app styles with
  **TailwindCSS v4 + shadcn/ui** â€” `src/styles/app.css` maps the tokens onto
  Tailwind's `@theme` (utilities like `bg-bg-1`, `text-fg-2`, `border-hair-2`,
  `bg-brand`), and UI is built from hand-tuned shadcn primitives in
  `src/components/ui/`. `tokens.css` stays the source of truth â€” never hard-code
  colors. See `docs/adr/0013-tailwindcss-shadcn.md`.

## Non-negotiable rules
1. **UI Spanish, code English.** User-facing strings go in `src/i18n/es.ts`.
2. **Dark mode only.** Use the design tokens; do not invent colors.
3. **Frozen tables.** Never write migrations that `ALTER`/`DROP`
   `Calendarios`, `Closers`, or `Personas`. Data CRUD via the UI is fine.
4. **Dev hits production `Evergreen` via SSH tunnel.** Never `pnpm db:push`;
   only `pnpm db:migrate`, and back up first (`pnpm db:backup`).
5. **pnpm only** (enforced) and **Biome** (no ESLint/Prettier).
6. **Always validate before handoff.** After code changes, run Biome on touched
   files and run `pnpm typecheck` before considering the task done.
7. Errors state what broke + what to do, in Spanish. No emoji. No apologies.
8. **Tables go through `src/components/Table.tsx`** (backed by TanStack Table) â€”
   every data/list screen uses it; opt into sorting per column via `sortValue`.
   Do not hand-roll `<table>` markup. The only exception is a non-record grid
   (e.g. the `/permissions` per-user grant matrix), which stays bespoke.

## Build order
Follow `docs/phases/` in order. GitHub Actions (phase 12) is **already live**;
**Tests** (phase 13) is the only remaining phase â€” do not scaffold it earlier
than the rest.

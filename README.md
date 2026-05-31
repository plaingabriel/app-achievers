# Achievers App

Internal admin dashboard for Achievers Academy — company data management, multi-step internal forms, and a live error-log viewer for the company's Express server. Invitation-only, dark-mode, monospace.

Fullstack single program on TanStack Start + MySQL, self-hosted on DigitalOcean. Two maintainers, free services only, no vendor lock-in.

## Quick start

```bash
corepack use pnpm@11      # pins exact pnpm 11 into package.json
pnpm install
cp .env.example .env      # fill in values
pnpm dev                  # http://localhost:3000
```

> Requires Node 24 and pnpm 11. `npm`/`yarn` are blocked by design.

## Where things are

| Path | What |
|---|---|
| `CLAUDE.md` | Start here if you're using Claude Code |
| `docs/adr/` | Architecture Decision Records — why each choice was made |
| `docs/phases/` | Ordered build phases, each a self-contained unit of work |
| `docs/runbooks/` | Deploy, restore-from-backup, fire-drill, credential rotation |
| `docs/db/` | Schema ownership rules + the `error_log` cross-repo contract |
| `.claude/skills/achievers-design/` | The Achievers design system as a skill |
| `src/` | Application code |

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Dev server |
| `pnpm build` | Production build |
| `pnpm check` / `check:fix` | Biome lint + format |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:generate` | Generate a Drizzle migration |
| `pnpm db:migrate` | Apply migrations (guarded — see ADR 0011) |
| `pnpm db:seed` | Bootstrap the first admin (one-time) |

## Status

Scaffold only. Build proceeds through `docs/phases/` in order, starting at phase 1.

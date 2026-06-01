# CLAUDE.md — App Achievers

Context for Claude Code. Read this first, then the relevant `docs/phases/` file for whatever you're building.

## What this is

An internal admin dashboard for Achievers Academy: manages company data, hosts multi-step internal forms, and shows a live error-log viewer for a separate Node/Express server. Invitation-only, under 50 users, two maintainers. Domain: `app.achieversacademy.es`.

## Non-negotiable constraints

- **Free services only.** No paid tiers. Ever.
- **No vendor lock-in for runtime hosting.** Runs as a plain Node process on a DigitalOcean droplet.
- **One program** — fullstack in a single TanStack Start app, not a split frontend/backend.
- **pnpm v11, forced.** Never run `npm` or `yarn`. The `preinstall` guard (`only-allow pnpm`) will reject them.
- **Biome only.** Never install ESLint or Prettier. Format and lint with `pnpm check:fix`.
- **JetBrains Mono everywhere. Dark mode only.** No theme toggle, no other fonts.
- **Spanish UI, English code.** Every user-facing string (labels, buttons, headings, errors, empty states, emails) is in Spanish. Everything in the codebase — identifiers, comments, commit messages, ADRs, docs — stays in English.
- **Tests are deferred.** Don't write tests until explicitly asked (the `tests/` folder is scaffolded but empty).

## Stack (all decisions are in `docs/adr/`)

| Concern | Choice | ADR |
|---|---|---|
| Meta-framework | TanStack Start (pinned `1.168.14`, v1 RC) | 0001 |
| Auth | Better Auth (email+password + TOTP) | 0002 |
| RBAC | Multi-role per user, admin-configurable, page-level | 0003 |
| User ↔ Personas | Optional soft link, app-validated, no DB FK | 0004 |
| Live logs | SSE | 0005 |
| Tooling | pnpm 11 + Biome | 0006 |
| Backups | Backblaze B2 + Bitwarden/paper passphrase | 0007 |
| ORM / schema ownership | Drizzle; dashboard owns migrations | 0008 |
| Email | Resend, behind a single `sendEmail()` | 0009 |
| Docs | ADRs in-repo | 0010 |
| Dev-against-prod safety | Enforced controls | 0011 |

## How the work is organized

`docs/phases/` breaks the build into ordered, self-contained phases. Each phase doc lists its goal, prerequisites, the ADRs it implements, a task checklist, and acceptance criteria. **Build in order** — each phase unblocks the next. Start at `docs/phases/phase-1-scaffold.md`.

## Design system

The Achievers design system is installed as a skill at `.claude/skills/achievers-design/`. **Before building any UI, read `.claude/skills/achievers-design/SKILL.md`.** It has the tokens (`colors_and_type.css`), the brand/voice guide, and reference components in `ui_kits/admin/`. Use the CSS variables from `src/styles/tokens.css` (a copy of the skill's tokens) — never hardcode colors, spacing, or fonts.

Copy rules that matter: **all user-facing copy is written in Spanish** (the design skill's examples are English — translate their intent, don't copy them verbatim), sentence case for UI labels, `[UPPERCASE]` brackets for eyebrows, no emoji, errors state what broke + what to do (never "successfully"/"correcto", never apologize).

## First-time setup (PHASE 1)

```bash
# Pin the exact pnpm 11 patch + integrity hash into package.json:
corepack use pnpm@11

# Generate the canonical TanStack Start framework files if any are missing
# (routeTree.gen.ts is generated on first dev/build):
pnpm install
pnpm dev
```

If TanStack Start's framework files have drifted from this scaffold (it's an RC and moves fast), trust the official docs at https://tanstack.com/start/latest/docs/framework/react/build-from-scratch over this scaffold, and update the relevant ADR if a decision changes.

## Gotchas

- `verbatimModuleSyntax` is **false** on purpose — TanStack Start warns it can leak server code into the client bundle. Don't turn it on.
- `src/routeTree.gen.ts` is generated — it's gitignored and Biome-ignored. Don't edit it.
- Migrations: only `pnpm db:migrate` (guarded). Never `drizzle-kit push` against prod (ADR 0011).
- The frozen tables `Personas`, `Closers`, `Calendarios` are excluded from migrations in `drizzle.config.ts`. Don't generate migrations that alter them.
- Secrets live in `/etc/achievers-app/.env` on the droplet, never in the repo.

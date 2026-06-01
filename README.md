# Achievers App

Internal admin dashboard for Achievers Academy. Manages company data and
internal forms, edits **every** production table in the `Evergreen` MySQL
database via the UI, and tails an error log shared with the existing Express
server. Invitation-only, dark-mode, monospace. Domain: `app.achieversacademy.es`.

> The full design rationale lives in [`docs/Achievers_App_Plan.md`](docs/Achievers_App_Plan.md).
> Decisions are recorded as ADRs in [`docs/adr/`](docs/adr). The build is staged
> in [`docs/phases/`](docs/phases). Agents: start at [`CLAUDE.md`](CLAUDE.md).

## Stack

- React 19 + **TanStack Start** (pinned `@tanstack/react-start@1.168.14`)
- **TailwindCSS v4** + **shadcn/ui** — design tokens from the achievers-design skill (ADR 0013)
- TypeScript (strict) · **Drizzle ORM** → MySQL (`Evergreen`)
- **Better Auth** (email/password, invitation-only, TOTP 2FA)
- **Resend** email · SSE error-log tail · `node-cron` retention
- **pnpm 11** (forced) · **Biome** (lint+format) · Node 24

## Quick start

```bash
corepack enable && corepack prepare pnpm@11 --activate
pnpm install
cp .env.example .env          # then fill it in (see below)
# open the SSH tunnel to Evergreen in another terminal (see below), then:
pnpm dev                      # http://localhost:3000
```

The TanStack route tree (`src/routeTree.gen.ts`) is generated on first `pnpm dev`.

## Conventions (hard rules)

- **UI in Spanish, code in English.** All user-facing copy is Spanish (kept in
  `src/i18n/es.ts`); identifiers, comments, and docs are English. The existing
  Spanish table/column names stay as-is. (plan §5)
- **Dark mode only.** No theme toggle.
- The three existing tables (`Calendarios`, `Closers`, `Personas`) are
  **schema-frozen**: full data CRUD via the UI, but never `ALTER`/`DROP`. The
  `drizzle.config.ts` `tablesFilter` enforces this. (plan §4.1 / §4.7)

## Connecting to the `Evergreen` database from dev

`Evergreen` lives on the production DigitalOcean droplet and only listens on
`127.0.0.1` — it is **not** exposed publicly. There is no separate dev DB: you
tunnel to production, then point a local `DATABASE_URL` at the tunnel. You are
working against **production data** — read the safety notes.

1. **One-time:** put your SSH public key on the droplet (ask a maintainer) and
   get your own MySQL dev user + password for `Evergreen` (not `root`).
2. **Open the tunnel** in a dedicated terminal (keep it open):
   ```bash
   ssh -N -L 3306:127.0.0.1:3306 <ssh-user>@<droplet-ip>
   # if local 3306 is taken, forward another local port, e.g. 3307
   ```
3. **Point the app at the tunnel** in `.env`:
   ```bash
   DATABASE_URL="mysql://<dev-user>:<password>@127.0.0.1:3306/Evergreen"
   ```
4. **Verify:** `pnpm db:studio` (or `mysql -h 127.0.0.1 -P 3306 -u <dev-user> -p Evergreen`).

**Optional persistent tunnel** — add to `@/.ssh/config`:
```
Host evergreen-db
  HostName <droplet-ip>
  User <ssh-user>
  LocalForward 3306 127.0.0.1:3306
```
then `ssh -N evergreen-db` (or `autossh -M 0 -N evergreen-db`).

### Safety notes
- This is the **real production database**. Edits and deletes are live.
- Read+write is allowed (to test CRUD), but **never** run `pnpm db:push`. Use
  `pnpm db:migrate`.
- **Back up before any migration:** `pnpm db:backup` (see `docs/runbooks`).
- Migrations must never touch `Calendarios`, `Closers`, or `Personas`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` / `pnpm build` / `pnpm start` | TanStack Start dev / build / serve |
| `pnpm typecheck` / `pnpm check` | `tsc --noEmit` / Biome check |
| `pnpm db:generate` / `pnpm db:migrate` / `pnpm db:studio` | Drizzle migrations / studio |
| `pnpm db:seed` | First-admin bootstrap (plan §8) |
| `pnpm db:backup` | Evergreen dump → local + Backblaze B2 |

CI/CD (GitHub Actions) and the test suite are **not scaffolded yet** — they are
the last two build phases (`docs/phases`).

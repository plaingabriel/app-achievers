# Achievers App — Build Plan

**Status:** work in progress · iteration 5
**Last updated:** 2026-05-31

An internal admin dashboard for managing company data, internal multi-step forms, and an error-log viewer for an existing Node/Express server. The dashboard provides full data CRUD (create / read / update / delete rows) over **every** production table in the `Evergreen` MySQL database via its UI. Two maintainers, under 50 users, invitation-only access, dark-mode UI per the Achievers design system. Domain: **app.achieversacademy.es**.

---

## 1. Hard constraints (non-negotiable)

- **Free services only.** Every external service must have a sustainable free tier at our scale.
- **No vendor lock-in for runtime hosting.** Code must run on any Node-capable host.
- **One program**, not split into separate frontend + backend processes.
- **Self-hosted** on the existing DigitalOcean droplet (shared with the existing Express server).
- **React** (team familiarity).
- **pnpm v11, forced.** Enforced via `packageManager` field + `only-allow pnpm` preinstall script.
- **Biome** for lint + format. Replaces ESLint + Prettier. One tool, one config.
- **JetBrains Mono everywhere** per the Achievers design system.
- **Dark mode only.** No theme toggle.

---

## 2. Locked decisions

| Area | Decision |
|---|---|
| Frontend framework | React |
| Meta-framework | TanStack Start (v1 RC — see §9 for version policy) |
| Language | TypeScript, strict mode |
| Database | MySQL — database name **`Evergreen`** (existing, shared with Express server) |
| ORM | Drizzle ORM |
| Schema ownership | Dashboard owns its own tables' schema + migrations; the 3 existing tables stay **schema-frozen** but are **fully data-editable** via the UI (see §4.1) |
| Data editing scope | **Full CRUD on every production table** via the dashboard UI (see §4.1, §4.7) |
| Runtime | Node.js 24 LTS |
| OS | Ubuntu 22.04 LTS |
| Web server | nginx (already in use on the droplet) |
| Process manager | PM2 |
| Host | DigitalOcean droplet, `app.achieversacademy.es` |
| TLS | Let's Encrypt via certbot (already installed) |
| Package manager | pnpm v11, forced |
| Lint + format | Biome |
| Auth library | Better Auth (v1.4+) |
| 2FA | TOTP + backup codes via Better Auth `twoFactor` plugin |
| RBAC scope | Page / feature visibility |
| RBAC config | Admin-configurable via UI |
| RBAC schema shape | Shape B — multi-role per user (see §4.4) |
| User ↔ Personas link | Option A — optional soft FK, no DB constraint (see §4.2) |
| Registration | Invitation-only, no public signup |
| First admin | Seed script with one-time password (see §8) |
| Email vendor | Resend |
| Live updates | SSE for the error-log tail |
| Error log retention | 1 week, auto-purged |
| `error_log` schema | Designed in §4.6 (table does not yet exist) |
| Audit log scope | Sensitive auth events only (see §4.5) |
| Audit log visibility | User sees own events; admin sees all |
| Initial roles | `admin`, `editor`, `viewer` |
| UI language | **Spanish** for all user-facing copy; **English** for all code/identifiers/docs (see §5) |
| Personas data quirks | Leave silent in UI (some people legitimately have no Notion ID) |
| Design system | Achievers (provided — bundle `App_Achievers_Design_System.zip`: tokens, previews, admin UI kit, assets). Implemented with **TailwindCSS v4 + shadcn/ui**; tokens → Tailwind `@theme`, primitives in `src/components/ui/` (see ADR 0013) |
| Backup storage | Backblaze B2 (free 10 GB tier) |
| CI/CD | GitHub Actions → SSH deploy to droplet |
| Tests | Deferred — scaffold folder now, write later |
| Dev DB | `Evergreen` production MySQL, reached via SSH tunnel (acknowledged risk — see README / §12 and §7.7) |
| Audience scale | 2 maintainers, < 50 users |

---

## 3. Architecture

```
[ Browser — React 19, TanStack Router/Start client ]
                │ HTTPS (app.achieversacademy.es)
                ▼
[ nginx — reverse proxy + TLS termination ]
                │ 127.0.0.1:3000
                ▼
[ TanStack Start app — Node 24, TypeScript, single PM2 process ]
   ├── Server functions / API routes
   ├── Better Auth (sessions, TOTP, invitations, password reset)
   ├── RBAC middleware (resolves user → roles → permissions)
   ├── SSE endpoint: GET /api/logs/stream
   ├── Cron task: purge error_log rows older than 7 days (node-cron, in-process)
   ├── Drizzle ORM → MySQL `Evergreen`  (owns its own tables; full CRUD on all)
   └── Email module (Resend SDK, single file behind an interface)

[ Existing Express server — Node 24, integration-heavy, less DB-intensive ]
   └── Reads/writes specific tables in the same MySQL (see §4.1 for ownership rules)

                ▼ Both processes connect to:
[ MySQL database `Evergreen` on the same droplet — bound to 127.0.0.1 only ]
   ├── Existing (schema-frozen, data fully editable via dashboard): Personas, Closers, Calendarios
   ├── Better Auth: user, session, account, verification, twoFactor*
   ├── RBAC: role, permission, role_permission, user_role
   ├── App: invitation, audit_log, error_log
```

Dev machines reach `Evergreen` through an SSH tunnel (MySQL is not exposed publicly). See §12 / the repo README for the tunnel command.

`*` Better Auth's `twoFactor` plugin manages its own table(s) for TOTP secrets and backup codes — we don't design these ourselves.

---

## 4. Schema design

### 4.1 Data vs. schema ownership (with two independent repos)

The Express server is integration-heavy (Notion, Calendly, etc.) and treats the database as one integration among many. The dashboard is database-intensive — it is the data-management front end for the whole `Evergreen` database and the source of truth for its own tables' schema and migrations.

Two distinct things must not be confused:

- **Data ownership (rows):** the dashboard has **full CRUD on every production table**, including the three existing ones. Any row in `Evergreen` can be created, edited, or deleted through the dashboard UI, subject to RBAC (§4.4) and the audit log (§4.5).
- **Schema ownership (structure/migrations):** the dashboard authors migrations only for its *own* tables. The three existing tables (`Personas`, `Closers`, `Calendarios`) remain **schema-frozen** — the dashboard does not generate `ALTER`/`DROP` migrations against them. They are declared in Drizzle (§4.7) purely for typed, full-CRUD data access.

| Table category | Data CRUD via dashboard | Schema owner / migration source | Express server interaction |
|---|---|---|---|
| `Personas`, `Closers`, `Calendarios` | **Full CRUD via UI** | **Schema-frozen** — neither repo `ALTER`s without explicit coordination | Read + write as today |
| Better Auth tables, RBAC, `invitation`, `audit_log` | Full CRUD via UI / app logic | Dashboard's Drizzle migrations | None — these are dashboard-private |
| `error_log` | Read (UI viewer) + app writes | Dashboard's Drizzle migrations | Express server **writes** to it; schema doc shared out-of-band (§11) |
| Future event/client-data tables | Full CRUD via UI | Dashboard's Drizzle migrations | Decided per-table when introduced |

**Process for any *schema* change to the frozen tables:** PR in the dashboard repo with a written impact statement, manual review by both maintainers, coordinated deploy of any matching Express server change. We expect this to happen rarely. (This governs structure only — editing rows in these tables is a normal, everyday dashboard operation and needs no PR.)

**Process for new dashboard tables that the Express server needs to read or write:** dashboard ships the migration first; the schema is documented in `docs/db/<table>.md`; Express server updates its raw SQL or types to match.

### 4.2 User ↔ Personas link (decided: Option A)

Add nullable `persona_id varchar(255)` to Better Auth's `user` table. No DB-level FK constraint (because `Personas.id` has mixed UUID/email formats). App-level validation via Drizzle relations.

```ts
// Illustrative — final shape lives in src/db/schema.ts
export const user = mysqlTable("user", {
  // ... Better Auth's columns
  personaId: varchar("persona_id", { length: 255 }),
  status: varchar("status", { length: 32 }).notNull().default("active"),
});

export const userRelations = relations(user, ({ one, many }) => ({
  persona: one(personas, { fields: [user.personaId], references: [personas.id] }),
  roles: many(userRole),
}));
```

The 2 dev maintainers have `persona_id = NULL`. Any future dashboard user who happens to also be a Persona gets the column populated. The dashboard's user-creation flow accepts a Persona pick but does not require one.

### 4.3 Future event-style tables

Deferred. When the first concrete event arrives, decide between "bespoke schema per event" (default leaning) vs. "generic JSON-per-row." Document the choice as an ADR (§11).

### 4.4 Auth + RBAC tables

Better Auth manages: `user`, `session`, `account`, `verification`, and the `twoFactor` plugin tables. On top, we add:

```
role
  id              varchar(36)   PRIMARY KEY
  name            varchar(64)   UNIQUE NOT NULL
  description     varchar(255)
  is_system       boolean       NOT NULL DEFAULT FALSE
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP

permission
  id              varchar(36)   PRIMARY KEY
  resource        varchar(64)   NOT NULL          -- e.g. "members", "logs", "personas"
  action          varchar(32)   NOT NULL          -- e.g. "read", "write", "delete"
  description     varchar(255)
  UNIQUE (resource, action)

role_permission
  role_id         varchar(36)   NOT NULL FK → role.id ON DELETE CASCADE
  permission_id   varchar(36)   NOT NULL FK → permission.id ON DELETE CASCADE
  PRIMARY KEY (role_id, permission_id)

user_role
  user_id         varchar(36)   NOT NULL FK → user.id ON DELETE CASCADE
  role_id         varchar(36)   NOT NULL FK → role.id ON DELETE RESTRICT
  granted_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
  granted_by      varchar(36)   FK → user.id
  PRIMARY KEY (user_id, role_id)

invitation
  id              varchar(36)   PRIMARY KEY
  email           varchar(255)  NOT NULL
  token_hash      varchar(255)  NOT NULL UNIQUE
  role_id         varchar(36)   NOT NULL FK → role.id
  invited_by      varchar(36)   NOT NULL FK → user.id
  expires_at      timestamp     NOT NULL
  used_at         timestamp     NULL
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
  INDEX (email)
```

Seeded at install:
- **Roles:** `admin` (is_system = true), `editor`, `viewer`.
- **Permissions:** cross-product of resources × actions, pruned to what makes sense:
  - Resources: `members`, `roles`, `invitations`, `personas`, `closers`, `calendarios`, `logs`, `audit`
  - Actions: `read`, `write`, `delete`, plus `audit:read_all` as a special permission for admin-wide audit visibility
- **`admin` role:** all permissions.
- **`editor`:** read + write on data resources, read on logs, read on own audit.
- **`viewer`:** read on data resources, read on own audit.

The "data resources" (`personas`, `closers`, `calendarios`, and any future data tables) are exactly the production tables exposed for full CRUD in the UI. `delete` is the only destructive action and is granted to `admin` only by default; `editor` can create/update but not delete. Every write — including to the three existing tables — flows through these permission checks and is recorded where §4.5 applies.

### 4.5 Audit log (sensitive auth events only)

```
audit_log
  id              varchar(36)   PRIMARY KEY
  user_id         varchar(36)   NULL FK → user.id     -- NULL for failed logins where user unknown
  actor_email     varchar(255)  NULL                  -- captured at event time, survives user deletion
  action          varchar(64)   NOT NULL              -- enum below
  target_type     varchar(64)   NULL                  -- "user", "role", "invitation", etc.
  target_id       varchar(255)  NULL
  metadata        json          NULL
  ip              varchar(45)   NULL                  -- v4 or v6
  user_agent      varchar(255)  NULL
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
  INDEX (user_id, created_at DESC)
  INDEX (action, created_at DESC)
```

**Logged actions (initial set):**
- `login.success`, `login.failure`, `logout`
- `totp.enabled`, `totp.disabled`, `totp.verified`, `totp.failed`
- `password.reset_requested`, `password.reset_completed`, `password.changed`
- `invitation.created`, `invitation.used`, `invitation.revoked`
- `role.granted`, `role.revoked`, `role.created`, `role.deleted`, `role.permissions_changed`
- `user.status_changed`
- `session.terminated`

**Visibility:**
- Regular user (`audit:read`): only own rows.
- Admin (`audit:read_all`): all rows.

Audit log is **append-only**. No update or delete from the app, even by admins.

### 4.6 `error_log` table (new — does not exist yet)

```
error_log
  id              bigint        AUTO_INCREMENT PRIMARY KEY
  level           varchar(16)   NOT NULL            -- "debug" | "info" | "warn" | "error" | "fatal"
  message         text          NOT NULL
  stack           text          NULL
  source          varchar(128)  NULL                -- e.g. "express:routes/orders", "dashboard:cron"
  request_id      varchar(64)   NULL                -- correlation across services
  metadata        json          NULL
  emitter         varchar(32)   NOT NULL            -- "express-server" | "dashboard"
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
  INDEX (created_at DESC)
  INDEX (level, created_at DESC)
  INDEX (emitter, created_at DESC)
```

**Writers:**
- Existing Express server inserts with `emitter = 'express-server'`.
- Dashboard inserts its own server-side errors with `emitter = 'dashboard'`.
- A schema doc (`docs/db/error_log.md`) documents the contract — see §11.
- The Express-side writer (the adapter that performs those inserts) is owned by the same maintainer who builds the dashboard, so there is no two-party handoff; the schema doc is self-documentation / future-proofing for any future contributor.

**Reader (dashboard UI):**
- SSE stream of new rows (`GET /api/logs/stream`).
- Filter by `level`, `emitter`, free-text in `message`, time range.
- Default view: last 24h, all emitters, all levels at or above `warn`.

**Retention:**
- Daily cron at 03:30 UTC: `DELETE FROM error_log WHERE created_at < NOW() - INTERVAL 7 DAY`.
- Runs in-process via `node-cron`, gated by a startup-time leader-lock (irrelevant at 1 process but futureproof if we ever scale).
- A `system` audit-log entry records each purge with row count.

### 4.7 Existing tables — Drizzle definitions (`Calendarios`, `Closers`, `Personas`)

These three tables already exist in `Evergreen`. They are declared in Drizzle so the dashboard can query and mutate them with full type safety, but they are **schema-frozen** (§4.1): the dashboard never generates migrations that `ALTER` or `DROP` them. The definitions below mirror the live `DESC` output exactly. MySQL `tinyint(1)` columns map to Drizzle `boolean()` (Drizzle stores `boolean` as `tinyint(1)`), so `setter` and `activo` are booleans; `activo` defaults to `1`/`true`.

```ts
// src/db/schema/existing.ts
// Frozen-schema, full-CRUD tables. Declared for typed access only — excluded
// from dashboard-authored migrations (see §4.1 + drizzle.config tablesFilter).
import { mysqlTable, varchar, char, boolean } from "drizzle-orm/mysql-core";

export const calendarios = mysqlTable("Calendarios", {
  pkNombre:  varchar("pk_nombre",  { length: 255 }).primaryKey(), // PK
  formId:    varchar("form_id",    { length: 255 }),
  landingId: varchar("landing_id", { length: 255 }),
  funnel:    varchar("funnel",     { length: 255 }),
  setter:    boolean("setter"),                                   // tinyint(1), nullable
  activo:    boolean("activo").default(true),                     // tinyint(1) default 1
});

export const closers = mysqlTable("Closers", {
  nombre:       varchar("nombre",        { length: 255 }),
  apellido:     varchar("apellido",      { length: 255 }),
  tagNotion:    varchar("tag_notion",    { length: 255 }),
  pkEmail:      varchar("pk_email",      { length: 255 }).primaryKey(), // PK
  idNotion:     varchar("id_notion",     { length: 255 }),
  formId:       varchar("form_id",       { length: 255 }),
  landingId:    varchar("landing_id",    { length: 255 }),
  avatarUrl:    varchar("avatar_url",    { length: 255 }),
  funnel:       varchar("funnel",        { length: 255 }),
  calendlyUser: varchar("calendly_user", { length: 255 }),
  activo:       boolean("activo").default(true),                       // tinyint(1) default 1
});

export const personas = mysqlTable("Personas", {
  id:   char("id", { length: 36 }).primaryKey(),     // char(36) PK
  name: varchar("name", { length: 255 }).notNull(),  // NOT NULL
});
```

**Keeping them out of migrations:** point `drizzle-kit` at the dashboard-owned tables only (e.g. a `tablesFilter` that excludes `Calendarios`, `Closers`, `Personas`, or maintain these defs in a file the migration generator does not introspect). The goal is that `pnpm db:generate` never emits DDL for the frozen tables even though they live in the same TS schema barrel used at runtime. This is what lets the dashboard read/write their data while honoring the schema freeze.

---

## 5. Project conventions

- **Package manager:** pnpm 11.x, forced.
  - `package.json` → `"packageManager": "pnpm@11.x.x"` (exact, no caret).
  - `preinstall` script: `npx only-allow pnpm`.
  - Lockfile committed; CI uses `--frozen-lockfile`.
- **Coexisting with the Express server on the droplet:** both repos use corepack-managed pnpm, each with its own `packageManager` field. The pnpm store is shared (content-addressable, fine). No cross-repo dependencies. No conflict expected.
- **Lint + format:** Biome.
  - Single `biome.json` at repo root.
  - Do not install ESLint, Prettier, or any of their plugins.
  - Pre-commit hook via `lefthook` running `biome check --write` on staged files.
- **TypeScript:** `strict: true`, `noUncheckedIndexedAccess: true`, `verbatimModuleSyntax: true`. No `any` without an inline `// FIXME(<author>): reason` comment.
- **Language: UI in Spanish, code in English.** This is a hard rule.
  - **Spanish (`es`):** every user-facing string — page titles, navigation, labels, buttons, table headers, form fields, placeholders, validation and error messages, empty states, tooltips, confirmation dialogs, and outbound emails. If a user can read it on screen or in their inbox, it is in Spanish.
  - **English:** everything in the codebase — identifiers (variables, functions, components, types), file and folder names, route paths, code comments, commit messages, ADRs, this plan, and internal/developer docs.
  - **The one sanctioned exception on the code side:** the existing Spanish table and column names (`Personas`, `Closers`, `Calendarios`, `pk_nombre`, etc.) stay as-is to match the live `Evergreen` DB. Better Auth tables stay English; new app tables are English. This bilingual schema is a documented quirk.
  - Keep UI copy out of source: put Spanish strings in a single message catalog (e.g. `src/i18n/es.ts`) rather than hard-coding them inline, so the Spanish/English boundary stays clean and reviewable.
- **Voice & copy** per the Achievers design system — these rules are language-agnostic and apply to the **Spanish** UI text:
  - Sentence case for UI labels and buttons (in Spanish — "Guardar cambios", not "Guardar Cambios").
  - `[UPPERCASE]` brackets for section eyebrows / decorative labels.
  - No emoji anywhere.
  - Errors: state what broke + what to do, in Spanish. No apologies. No "con éxito"/"successfully" filler.
- **No dark/light toggle.** Dark mode is the product.

---

## 6. CI/CD

### 6.1 CI on every push (GitHub Actions, free tier)

1. `corepack enable && corepack prepare pnpm@11 --activate`
2. `pnpm install --frozen-lockfile`
3. `pnpm biome ci .` (lint + format check)
4. `pnpm typecheck` (`tsc --noEmit`)
5. `pnpm build` (TanStack Start production build)

### 6.2 Deploy on push to `main` (after CI passes)

GitHub Actions SSH workflow that runs on the droplet:
1. `cd /srv/app-achievers`
2. `git fetch && git checkout <sha>`
3. `pnpm install --frozen-lockfile --prod=false`
4. `pnpm build`
5. `pnpm db:migrate` (Drizzle migrations — see §7.7 safeguards)
6. `pm2 reload app-achievers` (zero-downtime reload)
7. Post-deploy health check on `/healthz`; rollback on failure.

### 6.3 Env vars

- Stored in `/etc/app-achievers/.env`, owned by the service user, `chmod 600`.
- Never in the repo. Never in GitHub Actions logs.
- Variables: `DATABASE_URL` (points at the `Evergreen` database), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://app.achieversacademy.es`, `RESEND_API_KEY`, `RESEND_FROM=…`, `NODE_ENV=production`, `PORT=3000`.

### 6.4 nginx + TLS

certbot is already on the droplet. nginx terminates TLS on 443 for `app.achieversacademy.es` and reverse-proxies to PM2 on `127.0.0.1:3000`. The existing Express server already uses nginx — we add a new `server` block, no conflict. Auto-renewal via certbot's systemd timer.

### 6.5 Healthcheck endpoint

`GET /healthz` returns `200 ok` only when:
- The process is responsive.
- A `SELECT 1` against MySQL succeeds within 1s.
- The Resend API key is present and the last outbound send (within 24h) did not fail; if no recent send, treat as "presumed healthy" and report `degraded: resend.unverified` in the body but still 200. (We don't ping Resend's API on every healthcheck — wasted quota and added latency.)

Body shape:
```json
{ "status": "ok", "db": "ok", "resend": "ok|unverified", "uptime_s": 12345, "version": "1.2.3" }
```

Non-200 only when DB is unreachable or the process is degraded enough that PM2 should restart it.

---

## 7. Operations — backup, restore, runbook

### 7.1 Single point of failure — what it means and why it matters

The whole system runs on one droplet:
- The Node app (TanStack Start + PM2)
- The MySQL database (the only copy of all data)
- nginx (reverse proxy)
- certbot's TLS certs
- The existing Express server

If the droplet goes away — hardware failure, accidental deletion, runaway process eating disk, DO outage — everything not stored elsewhere is gone. "Elsewhere" is the operative word.

This is called a **single point of failure (SPOF).** You accept it because the alternative is a different budget. The mitigation is not eliminating the SPOF — it's making recovery **fast and rehearsed**.

### 7.2 Quarterly fire drill

A backup you've never restored is hope, not a backup. Once a quarter:
1. Spin up a $4/month throwaway DO droplet.
2. Run §7.6 from scratch.
3. Verify login works and data is correct.
4. Destroy the droplet.
5. Write down anything that didn't work; fix before next drill.

30-60 minutes once a quarter. Saves you from learning your backup is broken at 2am.

### 7.3 What gets backed up

| Item | Where it lives | Where it gets backed up | Frequency |
|---|---|---|---|
| MySQL database (full) | `localhost:3306` | (a) `/var/backups/mysql/` on droplet, (b) Backblaze B2 (§7.5) | Daily 04:00 UTC |
| `/etc/app-achievers/.env` | The droplet | Backblaze B2, encrypted with gpg | On change + daily |
| Application code | GitHub `main` | Already redundant (GitHub) | On every push |
| nginx config | `/etc/nginx/sites-available/` | Backblaze B2 | On change |
| TLS certs | `/etc/letsencrypt/` | Backblaze B2 (encrypted) — optional, certbot can recreate | Weekly |

### 7.4 Backup script

`/usr/local/bin/achievers-backup.sh` (run by cron at 04:00 daily):
```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/mysql
mkdir -p "$DEST"
mysqldump --single-transaction --quick --routines --triggers --events \
  --databases Evergreen \
  | gzip -9 > "$DEST/achievers-$TS.sql.gz"
# Retention: keep 14 days local
find "$DEST" -name 'achievers-*.sql.gz' -mtime +14 -delete
# Offsite sync
rclone copy "$DEST/achievers-$TS.sql.gz" b2:achievers-backups/db/
```

### 7.5 Offsite storage — Backblaze B2 (decided)

10 GB free, 1 GB/day download free, S3-compatible. Configured via `rclone config` with a B2 application key (not the master key). Our daily compressed dump is a few MB, so the free tier is enormous. If we ever leave, swap is one rclone remote.

### 7.6 Recovery runbook

**Trigger:** droplet unreachable for >15 minutes, or confirmed data loss.

1. **Provision new droplet:** DigitalOcean, Ubuntu 22.04 LTS, same region.
2. **Install runtimes:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs mysql-server nginx certbot python3-certbot-nginx rclone gnupg
   sudo npm install -g pm2
   ```
3. **Restore env file:**
   ```bash
   rclone copy b2:achievers-backups/env/env.gpg /tmp/
   gpg --decrypt /tmp/env.gpg > /etc/app-achievers/.env
   sudo chmod 600 /etc/app-achievers/.env
   ```
4. **Restore DB:**
   ```bash
   LATEST=$(rclone lsf b2:achievers-backups/db/ --files-only | sort | tail -1)
   rclone copy "b2:achievers-backups/db/$LATEST" /tmp/
   gunzip < "/tmp/$LATEST" | mysql -u root Evergreen
   ```
5. **Clone app:**
   ```bash
   git clone git@github.com:<org>/app-achievers.git /srv/app-achievers
   cd /srv/app-achievers
   corepack enable && corepack prepare pnpm@11 --activate
   pnpm install --frozen-lockfile
   pnpm build
   ```
6. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup  # follow the printed command
   ```
7. **DNS:** point `app.achieversacademy.es` A record at the new droplet's IP.
8. **TLS:** `sudo certbot --nginx -d app.achieversacademy.es`.
9. **Health check:** `curl https://app.achieversacademy.es/healthz` → 200.
10. **Smoke test:** log in as seed admin; verify roles/users/logs.

Target restore time: under 60 minutes.

(Restoring the Express server is a separate runbook in its own repo.)

### 7.7 Dev-against-prod-DB controls (relaxed)

Dev connects directly to the `Evergreen` production database — there is no separate dev or staging database. The point of dev is to exercise the dashboard against real data, including writes. The controls below are deliberately lighter than a typical prod setup; the load-bearing one is the **mandatory pre-migration backup**.

1. **Network access via SSH tunnel only.** MySQL is bound to `127.0.0.1` on the droplet and is not exposed publicly. Dev reaches it through an SSH tunnel (see §12 / README). No public MySQL port, no firewall allowlist to maintain.
2. **Per-dev MySQL users with read + write.** Each dev gets their own credentialed user (not `root`, not a shared account) with `SELECT`/`INSERT`/`UPDATE`/`DELETE` so they can test full CRUD. *(Relaxed: the previous `SELECT`-only default + per-task write-grant dance is dropped.)*
3. **Mandatory backup immediately before any migration.** Run the §7.4 backup (or an on-demand `pnpm db:backup`) right before any `pnpm db:migrate` window. This is non-negotiable and the primary safety net.
4. **Never run `pnpm db:push` against prod.** Only `pnpm db:migrate`, which runs reviewed, versioned migration files.
5. **Migrations never touch the frozen tables.** No generated DDL against `Calendarios`, `Closers`, or `Personas` (§4.1 / §4.7); the `drizzle-kit` table filter enforces this.
6. **Cheap retained guard:** pre-commit hook still rejects raw `DROP`, `TRUNCATE`, or `DELETE FROM <table>` without `WHERE` in committed `.sql` files.

*(Dropped vs. iter 4: the `SELECT`-only default grant, the per-task grant/revoke flow, and the separate `staging` MySQL database. If a genuinely risky structural change comes up later, spin up a throwaway DB on the droplet ad hoc rather than maintaining a standing one.)*

### 7.8 Backup-encryption passphrase storage (decided: A + G)

The `.env` and TLS-cert backups are encrypted with a passphrase. That passphrase must survive both maintainers losing their devices, but must also not be obtainable by anyone outside the team. **Decided: A + G** — a Bitwarden free organization for everyday access, plus a sealed paper copy in a physical secure location as the disaster-recovery fallback. The full option set is kept below as rationale.

| Option | How it works | Free? | Pros | Caveats |
|---|---|---|---|---|
| **A. Bitwarden free Organization** ⭐ | Both devs join a free 2-user org, passphrase in a shared collection | Yes (Bitwarden's free org allows 2 users + shared collections) | Standard practice; cloud-accessible; audit log; recoverable if one dev loses access | Locked to Bitwarden the company; if both devs' accounts are simultaneously compromised, exposed. Mitigated by 2FA on Bitwarden accounts |
| **B. KeePass + synced via Backblaze/Dropbox/etc.** | Encrypted `.kdbx` file synced manually | Yes | Fully self-hosted-feel, format-portable | Manual sync is friction; both devs must remember to pull latest |
| **C. 1Password Business** | Same idea as Bitwarden, paid | No ($8/user/month) | Polished UX, strong recovery | Fails the "free" rule |
| **D. `git-crypt` or `sops` + age** | Encrypted secrets file in the repo, keys held by both devs | Yes | Version-controlled with the code | Adds a tool to the chain; key loss = total loss; lower transparency for non-developers |
| **E. Shamir's Secret Sharing** (`ssss-split`) | Split passphrase into N pieces, M required to reconstruct | Yes | No single account loss is fatal | Operational overhead, recovery needs coordination; for 2 devs, 2-of-2 is no better than a single shared copy; 2-of-3 needs a trusted third party |
| **F. Cloud KMS (AWS KMS / GCP KMS)** | Managed key service | No (costs per use, lock-in) | Industry standard | Violates "free + no lock-in" |
| **G. Sealed paper backup** (mandatory regardless) | Print passphrase, seal in envelope, store in safe deposit box or fireproof safe | Yes | Offline, immune to cloud account compromise | Requires physical access; one-shot disclosure means re-seal after every use |

**Decision: A + G.** Bitwarden free org for everyday access, plus a sealed paper copy in a physical secure location (one dev's locked drawer or safe deposit box) as the disaster-recovery fallback. Belt and suspenders. Total cost: zero.

**Rotation policy (decided):** rotate the passphrase annually, on any maintainer departure, and immediately on any suspected leak. Refresh the sealed paper copy each time it rotates.

---

## 8. First-admin bootstrap

A `pnpm db:seed` command that:
1. Creates the `admin`, `editor`, `viewer` roles and seeds the default permission set (§4.4).
2. Creates one user with email = `ADMIN_EMAIL` env var, password = a randomly generated 32-char string printed once to stdout.
3. Marks the user with `must_change_password = true` (extra column on `user`).
4. Grants the `admin` role.
5. Writes an audit log entry.

The script refuses to run if any `user` row already exists. After first login the admin must (a) change their password, (b) enroll TOTP, and (c) optionally invite the second admin via the UI.

---

## 9. TanStack Start version policy

- **Current pinned version:** `@tanstack/react-start@1.168.18` (upgraded 2026-05-31 from `1.168.14`, which shipped an incoherent dep tree — see ADR 0001 drift notes).
- **Pin exact, no caret, no tilde.** This applies to the whole router family:
  `@tanstack/react-router` (`1.170.10`, matching react-start's own pin) and
  `@tanstack/router-plugin` (`1.168.13`). A floating caret on `react-router`
  pulled in a second router copy and crashed SSR.
- **Status:** v1 Release Candidate. Team has stated the API is feature-complete and stable, but minor RC iterations may still introduce breaking changes — documented in changelogs.
- **Upgrade rule:** never on a Friday. Always read the changelog (https://github.com/TanStack/router/releases). For RC versions, also skim the docs blog.
- **Cadence:** plan to upgrade monthly if changelogs are quiet; immediately for security advisories.
- **Re-evaluate at v1 stable:** when 1.0 is cut, switch policy to "patch updates without changelog review, minor with review."
- **React Server Components:** team has stated RSC support will land as a non-breaking v1.x addition. We don't adopt it on day one.

---

## 10. Risks / known issues

- **Single droplet = SPOF.** Mitigated by §7 backup/restore runbook and quarterly fire drills.
- **Dev writes to the prod `Evergreen` DB.** There is no separate dev/staging DB, and dev users have write access. Mitigated by SSH-tunnel-only access, mandatory pre-migration backups, `db:migrate`-only (never `db:push`), and the relaxed-but-present controls in §7.7.
- **TanStack Start still in RC.** Mitigated by version pinning policy (§9) and not adopting RSC early.
- **Personas data quality** — mixed UUID/email IDs. Mitigated by treating the column as opaque varchar(255) and soft-linking at app level. UI does not surface this as a warning (some people legitimately have no Notion ID).
- **Shared MySQL with Express server.** Schema migrations could break the existing server. Mitigated by §4.1 ownership rules (existing tables schema-frozen), PR review for any frozen-table structure change, and the `drizzle-kit` table filter that prevents accidental DDL against them.
- **Full data CRUD on the existing tables via the UI.** A bad edit hits the same rows the Express server reads/writes. Mitigated by RBAC (`delete` is admin-only), the audit log, daily backups, and the schema freeze keeping structure stable.
- **Cross-repo schema drift on `error_log`.** Mitigated by a written schema-doc contract (§11) and the `emitter` column being explicit so any inserter is identifiable.
- **Tests deferred.** Mitigated by scaffolding the test folder now and committing to add tests before a third contributor joins.
- **Resend lock-in (minor).** Mitigated by isolating sending behind a single `sendEmail()` interface.

---

## 11. Documentation strategy (decided: A)

Where do we write architectural decisions so future devs can find them? **Decided: A** — ADRs in `docs/adr/` plus the markdown files we already keep. The full option set is kept below as rationale.

| Option | What it is | Pros | Caveats |
|---|---|---|---|
| **A. ADRs (Architecture Decision Records)** in `docs/adr/` | Numbered Markdown files, one per decision, with `Status`, `Context`, `Decision`, `Consequences` sections. Industry standard (Michael Nygard's original format, now used everywhere from Spotify to Thoughtworks Tech Radar). | Each decision is self-contained. History is preserved (deprecated decisions stay, marked Superseded). PR review encourages discussion. Future devs can `grep -l "<topic>" docs/adr/` to find why. Format is portable, vendor-free. | Discipline required to actually write them. Risk of becoming a graveyard if maintainers don't enforce the habit. |
| **B. A single living `ARCHITECTURE.md`** | One file, all decisions, updated in place. | Easy to find everything in one place. Easy to grep. Newcomers read the whole thing in one sitting. | History lost without git blame. File grows. Current state and rationale intermix. Hard to see what was rejected and why. |
| **C. A docs site** (MkDocs, VitePress, Docusaurus, Astro Starlight, etc.) | A real static documentation site built from markdown. | Searchable, navigable, polished. Can include diagrams (mermaid), API docs, runbooks, ADRs in one place. Deploy free to GitHub Pages or the droplet. | One more thing to build and maintain. Overkill for 2 devs unless we expect external contributors or non-technical readers. |
| **D. GitHub Wiki** | Built-in per-repo wiki on GitHub. | Free, zero setup. | Stored in a separate git repo from the code (drift risk). Locked to GitHub. Easy to forget. Not great for cross-referencing code. |
| **E. Notion / Confluence / external KB** | Off-platform docs. | Rich editing, comments, non-developer friendly. | Vendor lock-in. Separated from code. Drift risk is high. Notion's free tier limits team features. |

**Decision: A + the existing markdown files we already have.** Concretely:

```
docs/
├── README.md                         # index — points at the things below
├── adr/
│   ├── template.md                   # copy this for new ADRs
│   ├── 0001-use-tanstack-start.md
│   ├── 0002-use-better-auth.md
│   ├── 0003-rbac-multi-role.md
│   ├── 0004-personas-soft-link.md
│   ├── 0005-sse-for-logs.md
│   ├── 0006-pnpm-11-and-biome.md
│   └── 0007-backblaze-b2-backups.md
├── runbooks/
│   ├── deploy.md                     # what `git push` triggers
│   ├── restore-from-backup.md        # §7.6 of this plan, lifted out
│   ├── rotate-credentials.md
│   └── fire-drill.md                 # quarterly DR test procedure
├── db/
│   ├── README.md                     # schema overview
│   ├── error_log.md                  # the cross-repo contract for the Express server
│   └── ownership.md                  # §4.1 of this plan, lifted out
└── architecture.md                   # current-state overview (the diagram at §3)
```

Why this layout:
- **All in the same repo as the code.** No external service, no drift, no lock-in. Future dev clones the repo and reads docs/.
- **ADRs are immutable once accepted.** New decisions get new ADRs that supersede old ones. The folder becomes a chronological history of why the architecture looks the way it does.
- **Runbooks live next to the code that uses them.** Restore procedure isn't in someone's Notion — it's in the repo.
- **`docs/db/` is the cross-repo contract layer.** The Express server's maintainers can read these files when they need to write to `error_log` or understand the frozen tables.
- **No build step.** GitHub renders markdown natively. Future-dev-friendly: no broken docs site, no stale generated HTML, no Docusaurus version-upgrade days.

**Migration plan from this `plan.md`:**
1. Once the major decisions stop iterating (after this round, likely), split `plan.md` into individual ADRs.
2. Move §7 → `docs/runbooks/restore-from-backup.md` and `docs/runbooks/fire-drill.md`.
3. Move §3 → `docs/architecture.md`.
4. Move §4 → individual ADRs + `docs/db/`.
5. Keep `plan.md` only for the duration of active iteration; archive it as `docs/adr/0000-initial-plan.md` once split.

---

## 12. Dev database connection (README content)

Production MySQL — the `Evergreen` database — runs on the DigitalOcean droplet, bound to `127.0.0.1:3306` only. **It is not exposed to the public internet.** There is no separate dev or staging database: dev works against `Evergreen` through an SSH tunnel, then points a local `DATABASE_URL` at the tunnel. The repo root `README.md` **must** contain the following section verbatim (adjust placeholders).

> ### Connecting to the `Evergreen` database from dev
>
> `Evergreen` lives on the production droplet and only listens on `127.0.0.1`. You reach it by forwarding a local port to the droplet over SSH, then pointing your local app at that port. You are talking to **production data** — see the safety notes below.
>
> **1. One-time setup.** Make sure your SSH public key is on the droplet (ask a maintainer) and that you have your own MySQL dev user + password for `Evergreen` (not `root`, not a shared account).
>
> **2. Open the tunnel.** In a dedicated terminal:
>
> ```bash
> # forwards local 3306 -> droplet's 127.0.0.1:3306
> ssh -N -L 3306:127.0.0.1:3306 <ssh-user>@<droplet-ip>
> ```
>
> `-N` means "don't run a remote command, just forward." Leave this terminal open while you work. If your machine already runs a local MySQL on 3306, forward a different local port instead (e.g. `3307`):
>
> ```bash
> ssh -N -L 3307:127.0.0.1:3306 <ssh-user>@<droplet-ip>
> ```
>
> **3. Point the app at the tunnel.** In your local `.env`:
>
> ```bash
> DATABASE_URL="mysql://<dev-user>:<password>@127.0.0.1:3306/Evergreen"
> # use :3307 if you forwarded a different local port
> ```
>
> **4. Verify the connection.**
>
> ```bash
> mysql -h 127.0.0.1 -P 3306 -u <dev-user> -p Evergreen   # then: SHOW TABLES;
> # or
> pnpm db:studio
> ```
>
> **Optional — persistent tunnel.** Add a `~/.ssh/config` entry so you can run `ssh evergreen-db`:
>
> ```
> Host evergreen-db
>   HostName <droplet-ip>
>   User <ssh-user>
>   LocalForward 3306 127.0.0.1:3306
> ```
>
> For an auto-reconnecting tunnel, use `autossh -M 0 -N evergreen-db`.
>
> **Safety notes (read before writing anything):**
> - This is the **real production database**. Edits and deletes are live.
> - Read + write is allowed so you can test full CRUD — but **never** run `pnpm db:push`. Use `pnpm db:migrate`.
> - **Take a backup before any migration** (see plan §7.7 / `docs/runbooks`).
> - Migrations must never `ALTER`/`DROP` `Calendarios`, `Closers`, or `Personas` — they are schema-frozen (plan §4.1, §4.7).

---

## 13. Change log

- **iter 7 (2026-05-31):** Cleanup pass to finalize the plan. Locked the two pending decisions: backup-passphrase storage = **A + G** with an annual / on-departure / on-leak rotation policy (§7.8), and documentation strategy = **A** (ADRs + existing markdown) (§11). Removed the “open questions” section — its still-unsettled items (`error_log` writer ownership, repo name / GitHub org, droplet sizing) are tracked outside this plan. Moved the change log to the end and renumbered (docs strategy → §11, dev DB connection → §12, change log → §13).
- **iter 6 (2026-05-31):** Confirmed `Personas.id` genuinely mixes UUIDs and emails (e.g. `fothyb@gmail.com`), so the §4.2/§10 opaque-ID handling was correct and is unchanged. Added a hard **UI-in-Spanish / code-in-English** language convention (§5) plus a locked-decisions row; clarified that the Achievers voice/casing rules apply to the Spanish copy. Stored the provided design-system bundle (`App_Achievers_Design_System.zip` — tokens, component previews, admin React UI kit, assets, and a starter `SKILL.md`) for the upcoming scaffolding skill.
- **iter 5 (2026-05-31):** Named the database **`Evergreen`** and updated all DB references (architecture diagram, backup/restore scripts, env note, decisions table). Added §4.7 with Drizzle schema definitions for the three existing tables (`Calendarios`, `Closers`, `Personas`) mirroring the live `DESC` output (`tinyint(1)` → `boolean`). Reworked §4.1 to separate **data ownership** (full CRUD on every production table via the UI) from **schema ownership** (the 3 existing tables stay schema-frozen). Confirmed RBAC exposes every data table for CRUD with `delete` admin-only (§4.4). Dev now connects to the `Evergreen` prod DB over an **SSH tunnel**; §7.7 relaxed to allow dev writes while keeping **mandatory pre-migration backups** and dropping the `SELECT`-only default and the standing staging DB. Added §12 (dev DB connection — README content). Updated §10 risks accordingly.
- **iter 4 (2026-05-27):** Locked Node 24 + Ubuntu 22, Backblaze B2, schema ownership rules (dashboard owns + co-owned frozen tables), `error_log` schema, healthcheck endpoint scope (DB + Resend), seeded role/permission detail. Added §7.8 backup-passphrase storage options (A+G recommended). Added §11 documentation strategy options. Confirmed corepack coexistence is fine. Personas data quirks: leave silent. User ↔ Personas: Option A locked.
- **iter 3 (2026-05-27):** Locked Better Auth + Drizzle + PM2 + Resend + SSE + Shape B. Added §4 schema design, §7 operations runbook with SPOF explanation, §9 TanStack Start version policy.
- **iter 2 (2026-05-27):** Locked TanStack Start, TOTP, page-level RBAC with admin-configurable roles, GitHub Actions deploy, pnpm 11 + Biome as hard constraints.
- **iter 1 (2026-05-27):** Initial requirements gathered.

# Achievers App — Build Plan

**Status:** planning complete — ready to scaffold · iteration 5
**Last updated:** 2026-05-27

An internal admin dashboard for managing company data, internal multi-step forms, and an error-log viewer for an existing Node/Express server. Two maintainers, under 50 users, invitation-only access, dark-mode UI per the Achievers design system. Domain: **app.achieversacademy.es**.

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
| Database | MySQL (existing, shared with Express server) |
| ORM | Drizzle ORM |
| Schema ownership | The dashboard owns the schema + migrations (see §4.1) |
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
| Personas data quirks | Leave silent in UI (some people legitimately have no Notion ID) |
| Design system | Achievers (provided) |
| Backup storage | Backblaze B2 (free 10 GB tier) |
| CI/CD | GitHub Actions → SSH deploy to droplet |
| Tests | Deferred — scaffold folder now, write later |
| Dev DB | Production MySQL (acknowledged risk) |
| Audience scale | 2 maintainers, < 50 users |
| Repo name | `achievers-app` (single repo, separate from the Express server) |
| Backup passphrase storage | Bitwarden free org + sealed paper backup (A + G) |
| Passphrase rotation | Annually (or on any maintainer departure / suspected leak) |
| Documentation | ADR-based, in-repo `docs/` (see §13) |
| `error_log` status | Not implemented anywhere yet; same dev builds the dashboard reader and the Express writer |

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
   ├── Drizzle ORM → MySQL  (dashboard owns the schema)
   └── Email module (Resend SDK, single file behind an interface)

[ Existing Express server — Node 24, integration-heavy, less DB-intensive ]
   └── Reads/writes specific tables in the same MySQL (see §4.1 for ownership rules)

                ▼ Both processes connect to:
[ MySQL on the same droplet ]
   ├── Existing (frozen schema): Personas, Closers, Calendarios
   ├── Better Auth: user, session, account, verification, twoFactor*
   ├── RBAC: role, permission, role_permission, user_role
   ├── App: invitation, audit_log, error_log
```

`*` Better Auth's `twoFactor` plugin manages its own table(s) for TOTP secrets and backup codes — we don't design these ourselves.

---

## 4. Schema design

### 4.1 Schema ownership (with two independent repos)

The Express server is integration-heavy (Notion, Calendly, etc.) and treats the database as one integration among many. The dashboard is database-intensive — it manages the schema, ships migrations, and is the source of truth.

| Table category | Owner | Migration source | Express server interaction |
|---|---|---|---|
| `Personas`, `Closers`, `Calendarios` | **Co-owned, schema frozen** | Neither repo modifies without explicit coordination | Read + write as today |
| Better Auth tables, RBAC, `invitation`, `audit_log` | Dashboard | Dashboard's Drizzle migrations | None — these are dashboard-private |
| `error_log` | Dashboard owns schema | Dashboard's Drizzle migrations | Express server **writes** to it; schema doc shared out-of-band (§13) |
| Future event/client-data tables | Dashboard owns schema | Dashboard's Drizzle migrations | Decided per-table when introduced |

**Process for any change to the frozen tables:** PR in the dashboard repo with a written impact statement, manual review by both maintainers, coordinated deploy of any matching Express server change. We expect this to happen rarely.

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

Deferred. When the first concrete event arrives, decide between "bespoke schema per event" (default leaning) vs. "generic JSON-per-row." Document the choice as an ADR (§13).

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
- A schema doc (`docs/db/error_log.md`) is the cross-repo contract — see §13.

**Reader (dashboard UI):**
- SSE stream of new rows (`GET /api/logs/stream`).
- Filter by `level`, `emitter`, free-text in `message`, time range.
- Default view: last 24h, all emitters, all levels at or above `warn`.

**Retention:**
- Daily cron at 03:30 UTC: `DELETE FROM error_log WHERE created_at < NOW() - INTERVAL 7 DAY`.
- Runs in-process via `node-cron`, gated by a startup-time leader-lock (irrelevant at 1 process but futureproof if we ever scale).
- A `system` audit-log entry records each purge with row count.

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
- **Voice & copy** per the Achievers design system:
  - Sentence case for UI labels and buttons.
  - `[UPPERCASE]` brackets for section eyebrows / decorative labels.
  - No emoji anywhere.
  - Errors: state what broke + what to do. No apologies. No "successfully".
- **No dark/light toggle.** Dark mode is the product.
- **Tables Spanish, code English.** The existing tables (`Personas`, `Closers`, `Calendarios`) stay Spanish. Better Auth tables stay English. New app tables: English. Code identifiers always English. The bilingual schema is a documented quirk.

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
1. `cd /srv/achievers-app`
2. `git fetch && git checkout <sha>`
3. `pnpm install --frozen-lockfile --prod=false`
4. `pnpm build`
5. `pnpm db:migrate` (Drizzle migrations — see §7.7 safeguards)
6. `pm2 reload achievers-app` (zero-downtime reload)
7. Post-deploy health check on `/healthz`; rollback on failure.

### 6.3 Env vars

- Stored in `/etc/achievers-app/.env`, owned by the service user, `chmod 600`.
- Never in the repo. Never in GitHub Actions logs.
- Variables: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://app.achieversacademy.es`, `RESEND_API_KEY`, `RESEND_FROM=…`, `NODE_ENV=production`, `PORT=3000`.

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
| `/etc/achievers-app/.env` | The droplet | Backblaze B2, encrypted with gpg | On change + daily |
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
  --databases achievers \
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
   gpg --decrypt /tmp/env.gpg > /etc/achievers-app/.env
   sudo chmod 600 /etc/achievers-app/.env
   ```
4. **Restore DB:**
   ```bash
   LATEST=$(rclone lsf b2:achievers-backups/db/ --files-only | sort | tail -1)
   rclone copy "b2:achievers-backups/db/$LATEST" /tmp/
   gunzip < "/tmp/$LATEST" | mysql -u root achievers
   ```
5. **Clone app:**
   ```bash
   git clone git@github.com:<org>/achievers-app.git /srv/achievers-app
   cd /srv/achievers-app
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

### 7.7 Dev-against-prod-DB controls (enforced)

1. **Per-dev MySQL users** with default `SELECT`-only grants. Write grants applied per-task, removed after.
2. **Pre-commit hook** rejects any commit containing raw `DROP`, `TRUNCATE`, or `DELETE FROM <table>` without `WHERE` in `.sql` files.
3. **Drizzle migration script** prints a 5-second sleep + the SQL it's about to run before executing against prod, with explicit `--yes` flag required.
4. **Daily backup runs before any planned migration window.**
5. **Never run `pnpm db:push`** against prod. Only `pnpm db:migrate`.
6. **A `staging` MySQL database on the same droplet** (same MySQL instance, separate database, costs nothing). Use for risky schema changes.

### 7.8 Backup-encryption passphrase storage — decided: A + G

The `.env` and TLS-cert backups are encrypted with a passphrase. That passphrase must survive both maintainers losing their devices, but must also not be obtainable by anyone outside the team. **Decided: Bitwarden free org (A) for everyday access + sealed paper backup (G) for disaster recovery.** Options table retained below for the record.

| Option | How it works | Free? | Pros | Caveats |
|---|---|---|---|---|
| **A. Bitwarden free Organization** ⭐ | Both devs join a free 2-user org, passphrase in a shared collection | Yes (Bitwarden's free org allows 2 users + shared collections) | Standard practice; cloud-accessible; audit log; recoverable if one dev loses access | Locked to Bitwarden the company; if both devs' accounts are simultaneously compromised, exposed. Mitigated by 2FA on Bitwarden accounts |
| **B. KeePass + synced via Backblaze/Dropbox/etc.** | Encrypted `.kdbx` file synced manually | Yes | Fully self-hosted-feel, format-portable | Manual sync is friction; both devs must remember to pull latest |
| **C. 1Password Business** | Same idea as Bitwarden, paid | No ($8/user/month) | Polished UX, strong recovery | Fails the "free" rule |
| **D. `git-crypt` or `sops` + age** | Encrypted secrets file in the repo, keys held by both devs | Yes | Version-controlled with the code | Adds a tool to the chain; key loss = total loss; lower transparency for non-developers |
| **E. Shamir's Secret Sharing** (`ssss-split`) | Split passphrase into N pieces, M required to reconstruct | Yes | No single account loss is fatal | Operational overhead, recovery needs coordination; for 2 devs, 2-of-2 is no better than a single shared copy; 2-of-3 needs a trusted third party |
| **F. Cloud KMS (AWS KMS / GCP KMS)** | Managed key service | No (costs per use, lock-in) | Industry standard | Violates "free + no lock-in" |
| **G. Sealed paper backup** (mandatory regardless) | Print passphrase, seal in envelope, store in safe deposit box or fireproof safe | Yes | Offline, immune to cloud account compromise | Requires physical access; one-shot disclosure means re-seal after every use |

**Recommendation: A + G.** Bitwarden free org for everyday access, plus a sealed paper copy in a physical secure location (one dev's locked drawer or safe deposit box) as the disaster-recovery fallback. Belt and suspenders. Total cost: zero. Refresh the paper copy whenever the passphrase rotates (annually is reasonable).

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

- **Current pinned version:** `@tanstack/react-start@1.168.14` (latest release as of 2026-05-26).
- **Pin exact, no caret, no tilde.**
- **Status:** v1 Release Candidate. Team has stated the API is feature-complete and stable, but minor RC iterations may still introduce breaking changes — documented in changelogs.
- **Upgrade rule:** never on a Friday. Always read the changelog (https://github.com/TanStack/router/releases). For RC versions, also skim the docs blog.
- **Cadence:** plan to upgrade monthly if changelogs are quiet; immediately for security advisories.
- **Re-evaluate at v1 stable:** when 1.0 is cut, switch policy to "patch updates without changelog review, minor with review."
- **React Server Components:** team has stated RSC support will land as a non-breaking v1.x addition. We don't adopt it on day one.

---

## 10. Risks / known issues

- **Single droplet = SPOF.** Mitigated by §7 backup/restore runbook and quarterly fire drills.
- **Dev runs against prod MySQL.** Mitigated by §7.7 enforced controls.
- **TanStack Start still in RC.** Mitigated by version pinning policy (§9) and not adopting RSC early.
- **Personas data quality** — mixed UUID/email IDs. Mitigated by treating the column as opaque varchar(255) and soft-linking at app level. UI does not surface this as a warning (some people legitimately have no Notion ID).
- **Shared MySQL with Express server.** Schema migrations could break the existing server. Mitigated by §4.1 ownership rules, PR review, and the staging DB.
- **Cross-repo schema drift on `error_log`.** Mitigated by a written schema-doc contract (§13) and the `emitter` column being explicit so any inserter is identifiable.
- **Tests deferred.** Mitigated by scaffolding the test folder now and committing to add tests before a third contributor joins.
- **Resend lock-in (minor).** Mitigated by isolating sending behind a single `sendEmail()` interface.

---

## 11. Planning status — complete

All open questions resolved as of iteration 5:

1. Backup-encryption passphrase storage → **A + G** (Bitwarden free org + sealed paper).
2. Documentation strategy → **ADR-based** in-repo `docs/`.
3. `error_log` writer coordination → **same dev builds both sides.** The error-log feature is not implemented anywhere yet. The dashboard ships the table and reader first; the same dev adds the `emitter = 'express-server'` writer to the Express server afterward. Until then, the only rows will be `emitter = 'dashboard'`. Low drift risk since one person owns both.
4. Repo name → **`achievers-app`**, separate repo from the Express server.
5. Droplet size → **confirmed sufficient** for MySQL + Express server + dashboard + cron.
6. Passphrase rotation → **annually**, plus on any maintainer departure or suspected leak.

### Build phase — proposed order

1. **Scaffold** `achievers-app`: package.json (pnpm 11 forced), biome.json, tsconfig (strict), TanStack Start (pinned 1.168.14), Drizzle config, lefthook pre-commit, `docs/` skeleton with the ADR template.
2. **DB layer:** Drizzle schema for the new tables (§4.4, §4.5, §4.6) + Better Auth tables + soft link to `Personas` (§4.2). First migration.
3. **Auth:** Better Auth wired with email+password, TOTP plugin, invitation flow, Resend email module behind an interface. Seed script (§8).
4. **RBAC:** permission middleware, role/permission admin UI, page-level gating.
5. **Error-log viewer:** SSE stream endpoint + table UI with filters; the 7-day purge cron.
6. **Forms:** the multi-step internal forms (specs TBD per form).
7. **Ops:** backup script + cron, healthcheck endpoint, PM2 ecosystem file, nginx server block, GitHub Actions CI + deploy workflows.
8. **Docs:** split this `plan.md` into ADRs + runbooks (§13 migration plan).
9. **Tests:** scaffold now (empty), write later per the deferred-testing decision.

---

## 12. Change log

- **iter 5 (2026-05-27):** Planning complete. Locked: backup passphrase A+G, ADR-based docs, repo name `achievers-app`, droplet size confirmed, annual passphrase rotation. `error_log` confirmed not-yet-implemented with same dev owning both reader and writer. Added build-phase order in §11.
- **iter 4 (2026-05-27):** Locked Node 24 + Ubuntu 22, Backblaze B2, schema ownership rules (dashboard owns + co-owned frozen tables), `error_log` schema, healthcheck endpoint scope (DB + Resend), seeded role/permission detail. Added §7.8 backup-passphrase storage options (A+G recommended). Added §13 documentation strategy options. Confirmed corepack coexistence is fine. Personas data quirks: leave silent. User ↔ Personas: Option A locked.
- **iter 3 (2026-05-27):** Locked Better Auth + Drizzle + PM2 + Resend + SSE + Shape B. Added §4 schema design, §7 operations runbook with SPOF explanation, §9 TanStack Start version policy.
- **iter 2 (2026-05-27):** Locked TanStack Start, TOTP, page-level RBAC with admin-configurable roles, GitHub Actions deploy, pnpm 11 + Biome as hard constraints.
- **iter 1 (2026-05-27):** Initial requirements gathered.

---

## 13. Documentation strategy — decided: ADR-based

The user asked: where should we write architectural decisions so future devs can find them? Five options, with my recommendation at the bottom.

| Option | What it is | Pros | Caveats |
|---|---|---|---|
| **A. ADRs (Architecture Decision Records)** in `docs/adr/` | Numbered Markdown files, one per decision, with `Status`, `Context`, `Decision`, `Consequences` sections. Industry standard (Michael Nygard's original format, now used everywhere from Spotify to Thoughtworks Tech Radar). | Each decision is self-contained. History is preserved (deprecated decisions stay, marked Superseded). PR review encourages discussion. Future devs can `grep -l "<topic>" docs/adr/` to find why. Format is portable, vendor-free. | Discipline required to actually write them. Risk of becoming a graveyard if maintainers don't enforce the habit. |
| **B. A single living `ARCHITECTURE.md`** | One file, all decisions, updated in place. | Easy to find everything in one place. Easy to grep. Newcomers read the whole thing in one sitting. | History lost without git blame. File grows. Current state and rationale intermix. Hard to see what was rejected and why. |
| **C. A docs site** (MkDocs, VitePress, Docusaurus, Astro Starlight, etc.) | A real static documentation site built from markdown. | Searchable, navigable, polished. Can include diagrams (mermaid), API docs, runbooks, ADRs in one place. Deploy free to GitHub Pages or the droplet. | One more thing to build and maintain. Overkill for 2 devs unless we expect external contributors or non-technical readers. |
| **D. GitHub Wiki** | Built-in per-repo wiki on GitHub. | Free, zero setup. | Stored in a separate git repo from the code (drift risk). Locked to GitHub. Easy to forget. Not great for cross-referencing code. |
| **E. Notion / Confluence / external KB** | Off-platform docs. | Rich editing, comments, non-developer friendly. | Vendor lock-in. Separated from code. Drift risk is high. Notion's free tier limits team features. |

**Recommendation: A + the existing markdown files we already have.** Concretely:

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

If you instead want a richer experience (search, sidebar, nice typography), Option C (Astro Starlight) is the lightest path — but I'd still start with A and add C only if we feel pain.


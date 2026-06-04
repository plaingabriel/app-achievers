# Runbook — deploy

> CI/CD via GitHub Actions is **live** (`phase-12-github-actions`). Pushing to
> `main` runs CI (`.github/workflows/ci.yml`) then deploys via
> `.github/workflows/deploy.yml` using the same **build-on-runner + rsync** model
> as `server-achievers`: snapshot → rsync → install → migrate →
> `pm2 startOrReload` → health check, with automatic code rollback if
> `/api/healthz` (port **3001**) does not return 200.
>
> ⚠️ The pre-migrate `db:backup` is **temporarily disabled** in the deploy
> (B2/rclone not wired up). Re-enable it before running real migrations.

## Automated deploy (default)
Push to `main`. The deploy job is gated on CI and serialized (no overlapping
deploys). It builds `.output` on the runner, snapshots the live release to
`$SSH_PATH-prev`, then `rsync -avz --delete`s the tree (protecting `.env`). On a
failed post-deploy health check it restores the snapshot and reloads. The DB
migration is forward-only and **currently runs without a pre-migrate backup** —
until `db:backup` is re-enabled, take one manually (`pnpm db:backup`) before any
deploy that includes a migration.

> Note: the droplet install is a **full** `pnpm install --frozen-lockfile` (not
> `--prod`) because `drizzle-kit` (a devDependency) is needed for `db:migrate`.
> Runtime under pm2 still uses only prod deps.

### Required GitHub config
- **Secrets** (same names as `server-achievers`): `SSH_HOST`, `SSH_USER`,
  `SSH_PATH`, `SSH_PRIVATE_KEY`.
- App lives on port **3001** (`ecosystem.config.cjs`); the server app owns 3000.
- The droplet needs `nvm` (default Node 24), `pm2`, and a writable
  `/var/backups/mysql` (so `db:backup` runs in droplet mode). `$SSH_PATH` must
  not overlap the server app's path.

## Manual deploy (fallback)
Prefer re-running the `Deploy` workflow from the Actions tab. To deploy by hand,
build locally and rsync (the droplet is **not** a git clone under this model):
```bash
# On your machine, at the repo root:
pnpm install --frozen-lockfile && pnpm build
rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no" \
  --filter 'protect .env' --exclude .env --exclude .git --exclude .github \
  --exclude node_modules ./ <user>@<droplet>:<SSH_PATH>

# Then on the droplet:
ssh <user>@<droplet>
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use default
cd <SSH_PATH>
pnpm install --frozen-lockfile   # full install: drizzle-kit needed for migrate
pnpm db:backup                   # back up Evergreen BEFORE migrating
pnpm db:migrate
pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save
curl -fsS http://127.0.0.1:3001/api/healthz   # expect 200 (server app owns 3000)
```

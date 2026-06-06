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
- **`$SSH_PATH/.env` must hold all runtime vars** — at minimum `DATABASE_URL`,
  `BETTER_AUTH_SECRET` (≥32 chars), `BETTER_AUTH_URL` (the public HTTPS origin,
  `https://app.achievers.es` — Better Auth derives secure-cookie domains and
  callback URLs from it; a wrong value breaks login). `SERVER_URL` is optional —
  it defaults to the Express server's prod origin `https://server.achieversacademy.es`,
  which every dashboard→server request uses for now (even in dev). The nitro server does NOT
  auto-load `.env`, so pm2 starts Node with `--env-file=.env` (`node_args` in
  `ecosystem.config.cjs`). A missing/invalid var makes `src/lib/env.ts` throw and
  every request returns **500**. Note: `node_args` only apply on a fresh pm2
  start — after changing them, run `pm2 delete app-achievers` once so the next
  `pm2 startOrReload` relaunches with the flag (reload alone keeps old args).
- The droplet needs `nvm` (the deploy runs `nvm install` from the repo's
  `.nvmrc` to get Node 24 — it does **not** rely on the droplet's `default`
  alias, which is Node 20), `pm2`, and a writable
  `/var/backups/mysql` (so `db:backup` runs in droplet mode). `$SSH_PATH` must
  not overlap the server app's path.

### Deploy SSH key (one-time, per repo)
The runner connects **to** the droplet, so the key pair is generated on the
droplet: the public half authorizes logins into it, the private half becomes the
`SSH_PRIVATE_KEY` secret. The key **must be passphrase-less** —
`webfactory/ssh-agent` runs non-interactively and cannot unlock one (a
passphrase or a mangled paste surfaces as `Error loading key: error in
libcrypto`).

```bash
# 1. On the droplet, as the deploy user (this becomes SSH_USER):
ssh <SSH_USER>@<SSH_HOST>

# 2. Generate a dedicated, passphrase-less ed25519 key:
ssh-keygen -t ed25519 -C "gha-app-achievers-deploy" \
  -f ~/.ssh/app_achievers_deploy -N ""

# 3. Authorize the public half on this same droplet:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
cat ~/.ssh/app_achievers_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 4. Store the PRIVATE half as the secret. Prefer gh (preserves the trailing
#    newline that hand-pasting tends to drop):
gh secret set SSH_PRIVATE_KEY < ~/.ssh/app_achievers_deploy --repo <owner>/<repo>
#    No gh? Print it and paste the WHOLE thing (BEGIN/END lines + trailing
#    newline) into Settings → Secrets and variables → Actions → SSH_PRIVATE_KEY:
#    cat ~/.ssh/app_achievers_deploy

# 5. Once it's in the secret, remove the private key from disk (keep the .pub
#    and its authorized_keys entry):
rm ~/.ssh/app_achievers_deploy

# Sanity check the key is valid and unencrypted (prints pubkey, no prompt):
ssh-keygen -y -f ~/.ssh/app_achievers_deploy   # run BEFORE step 5
```

Notes: the runner uses `StrictHostKeyChecking=no`, so no `known_hosts` setup is
needed. If `sshd` restricts logins (`AllowUsers`/`AllowGroups` in
`/etc/ssh/sshd_config`), ensure `<SSH_USER>` is permitted.

## Public domain + TLS (nginx reverse proxy)
The app listens on **127.0.0.1:3001** (pm2) and is **not** exposed directly —
nginx terminates TLS and reverse-proxies the public domain to it. Keep 3001
firewalled (only 80/443 open, e.g. `ufw allow 'Nginx Full'`); proxy over the
loopback (`127.0.0.1`), never the public IP.

- **Domain:** `https://app.achievers.es` (an `A` record points it at the droplet
  IP). This must match `BETTER_AUTH_URL` in `.env`.
- **Cert:** Let's Encrypt via `sudo certbot --nginx -d app.achievers.es`
  (auto-renews; renewal reloads nginx). Issuance needs the `A` record live and
  port 80 reachable — `NXDOMAIN` from certbot means the DNS record is missing.

### nginx layout (two server blocks, two files)
certbot was first run while the stock `sites-available/default` still claimed
`server_name app.achievers.es`, so the cert + the HTTP→HTTPS redirect landed in
`default`. The split is now:

- `sites-available/default` — owns the **:80 → :443 redirect** for
  `app.achievers.es` (certbot's `if ($host = …) return 301` block). Its other
  blocks use `server_name _` (catch-all) and must **not** name
  `app.achievers.es`, or you get `conflicting server name … ignored`.
- `sites-available/app-achievers.conf` (symlinked into `sites-enabled/`) — the
  **:443** server block: the `ssl_certificate*` lines + `location /` proxying to
  `http://127.0.0.1:3001`. Streaming SSR and the `/api/logs/stream` SSE endpoint
  require `proxy_http_version 1.1`, `proxy_set_header Connection ""`,
  `proxy_buffering off`, `proxy_cache off`, and a long `proxy_read_timeout 1h`.

```nginx
# /etc/nginx/sites-available/app-achievers.conf
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name app.achievers.es;

    ssl_certificate     /etc/letsencrypt/live/app.achievers.es/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.achievers.es/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";   # SSE / streaming SSR
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
}
```

Apply + verify:
```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI http://app.achievers.es | grep -i location          # -> https://app.achievers.es/
curl -fsS https://app.achievers.es/api/healthz && echo OK     # app health, not nginx 404
```

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

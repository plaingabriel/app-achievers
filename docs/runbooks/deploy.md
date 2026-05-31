# Runbook: deploy

Push to `main` → GitHub Actions CI (install, biome, typecheck, build) → on success, SSH deploy to the droplet.

Droplet steps (see `.github/workflows/deploy.yml`):
1. `git checkout <sha>` in `/srv/achievers-app`
2. `pnpm install --frozen-lockfile`
3. `pnpm build`
4. `pnpm db:migrate --yes`
5. `pm2 reload achievers-app`
6. health check `https://app.achieversacademy.es/healthz`

## nginx
A `server` block for `app.achieversacademy.es` proxies to `127.0.0.1:3000`. The SSE location (`/api/logs/stream`) must set `proxy_buffering off;` and `proxy_read_timeout` high. TLS via certbot (auto-renew through its systemd timer).

## Secrets
GitHub Actions: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`. App secrets: `/etc/achievers-app/.env` (chmod 600), loaded by the app, not by PM2.

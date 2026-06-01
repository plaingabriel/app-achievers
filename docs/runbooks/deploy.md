# Runbook — deploy

> CI/CD via GitHub Actions is **not built yet** — it is the second-to-last build
> phase (`docs/phases/phase-12-github-actions.md`). Until then, deploy manually.

## Manual deploy (until phase 12)
```bash
ssh <user>@<droplet>
cd /srv/app-achievers
git fetch && git checkout <sha>
pnpm install --frozen-lockfile
pnpm build
pnpm db:backup            # back up Evergreen BEFORE migrating
pnpm db:migrate
pm2 reload app-achievers  # zero-downtime reload
curl -fsS http://127.0.0.1:3000/api/healthz   # expect 200
```

# Phase 7 — Operations

**Goal:** deploy pipeline, backups, healthcheck, droplet config. Can run in parallel with 2-6.

**Prerequisites:** Phase 1.
**Implements:** ADR 0007, 0011.

## Tasks
- [ ] `GET /healthz`: 200 only when process is up AND `SELECT 1` succeeds within 1s; report Resend as `ok|unverified` without pinging it every check (see `plan.md` §6.5).
- [ ] nginx server block for `app.achieversacademy.es` → `127.0.0.1:3000`; SSE location with buffering off. `certbot --nginx`.
- [ ] PM2: deploy with `ecosystem.config.cjs`, `pm2 save`, `pm2 startup`.
- [ ] GitHub Actions secrets: `DROPLET_HOST`, `DROPLET_USER`, `DROPLET_SSH_KEY`. Confirm CI gates deploy.
- [ ] Backup script `/usr/local/bin/achievers-backup.sh` + cron 04:00 UTC; `rclone` remote to Backblaze B2; gpg-encrypt `.env`/cert backups.
- [ ] Passphrase into Bitwarden free org + sealed paper copy (ADR 0007).
- [ ] Fill in `docs/runbooks/` and do one full fire drill on a throwaway droplet.

## Acceptance criteria
- Push to `main` deploys after CI; `/healthz` gates rollback.
- A backup exists in B2 and a fire-drill restore succeeded end to end.

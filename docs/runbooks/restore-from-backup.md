# Runbook — restore from backup (plan §7.6)

**Trigger:** droplet unreachable > 15 min, or confirmed data loss.
**Target restore time:** under 60 minutes.

1. **Provision** a new droplet (Ubuntu 22.04 LTS, same region).
2. **Install runtimes:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs mysql-server nginx certbot python3-certbot-nginx rclone gnupg
   sudo npm install -g pm2
   ```
3. **Restore env:** `rclone copy b2:achievers-backups/env/env.gpg /tmp/` →
   `gpg --decrypt /tmp/env.gpg > /etc/app-achievers/.env` → `chmod 600`.
4. **Restore DB into Evergreen:**
   ```bash
   LATEST=$(rclone lsf b2:achievers-backups/db/ --files-only | sort | tail -1)
   rclone copy "b2:achievers-backups/db/$LATEST" /tmp/
   gunzip < "/tmp/$LATEST" | mysql -u root Evergreen
   ```
5. **Clone + build:** `git clone … /srv/app-achievers && cd $_ && corepack enable && pnpm install --frozen-lockfile && pnpm build`.
6. **Start:** `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`.
7. **DNS:** point `app.achievers.es` at the new IP.
8. **TLS:** `sudo certbot --nginx -d app.achievers.es` (nginx reverse-proxies to
   `127.0.0.1:3001` — see `deploy.md` § Public domain + TLS).
9. **Health:** `curl https://app.achievers.es/api/healthz` → 200.
10. **Smoke test:** log in as seed admin; verify roles/users/logs.

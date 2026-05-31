# Runbook: restore from backup

**Trigger:** droplet unreachable >15 min, or confirmed data loss. Target: under 60 minutes.

1. **Provision** a new droplet: Ubuntu 22.04 LTS, same region.
2. **Install runtimes:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
   sudo apt-get install -y nodejs mysql-server nginx certbot python3-certbot-nginx rclone gnupg
   sudo npm install -g pm2
   ```
3. **Restore env:**
   ```bash
   rclone copy b2:achievers-backups/env/env.gpg /tmp/
   gpg --decrypt /tmp/env.gpg | sudo tee /etc/achievers-app/.env >/dev/null
   sudo chmod 600 /etc/achievers-app/.env
   ```
   (Passphrase from Bitwarden or the sealed paper copy — ADR 0007.)
4. **Restore DB:**
   ```bash
   LATEST=$(rclone lsf b2:achievers-backups/db/ --files-only | sort | tail -1)
   rclone copy "b2:achievers-backups/db/$LATEST" /tmp/
   gunzip < "/tmp/$LATEST" | mysql -u root achievers
   ```
5. **App:**
   ```bash
   git clone git@github.com:<org>/achievers-app.git /srv/achievers-app
   cd /srv/achievers-app
   corepack enable && corepack prepare pnpm@11 --activate
   pnpm install --frozen-lockfile && pnpm build
   ```
6. **PM2:** `pm2 start ecosystem.config.cjs && pm2 save && pm2 startup`
7. **DNS:** point `app.achieversacademy.es` at the new IP.
8. **TLS:** `sudo certbot --nginx -d app.achieversacademy.es`
9. **Verify:** `curl https://app.achieversacademy.es/healthz` → 200.
10. **Smoke test:** log in as an admin; check roles/users/logs.

The Express server has its own restore runbook in its own repo.

#!/usr/bin/env bash
# Daily MySQL backup of the Evergreen DB (plan §7.4). Run via cron at 04:00 UTC
# on the droplet, and ALWAYS before any planned migration window (plan §7.7).
set -euo pipefail
TS=$(date -u +%Y%m%dT%H%M%SZ)
DEST=/var/backups/mysql
mkdir -p "$DEST"
mysqldump --single-transaction --quick --routines --triggers --events \
  --databases Evergreen \
  | gzip -9 > "$DEST/achievers-$TS.sql.gz"
# Retention: keep 14 days local
find "$DEST" -name 'achievers-*.sql.gz' -mtime +14 -delete
# Offsite sync (Backblaze B2 via rclone)
rclone copy "$DEST/achievers-$TS.sql.gz" b2:achievers-backups/db/

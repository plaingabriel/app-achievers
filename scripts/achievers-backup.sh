#!/usr/bin/env bash
# MySQL backup of the Evergreen DB (plan §7.4). Two modes:
#
#   droplet — full dump → /var/backups/mysql + Backblaze B2 (rclone). Run via
#             cron at 04:00 UTC on the droplet (plan §7.4). UNCHANGED behavior.
#   dev     — pre-migration safety net (plan §7.7.3). Dumps through the SSH
#             tunnel using DATABASE_URL from .env into repo-local ./backups,
#             with no offsite sync. Used before `pnpm db:migrate`.
#
# The mode is auto-detected by whether /var/backups/mysql is writable; force it
# with ACHIEVERS_BACKUP_MODE=droplet|dev. Override the dev destination with
# BACKUP_DIR.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS=$(date -u +%Y%m%dT%H%M%SZ)

# Decide mode: explicit override wins, else auto by writability of the droplet dir.
MODE="${ACHIEVERS_BACKUP_MODE:-}"
if [[ -z "$MODE" ]]; then
  if mkdir -p /var/backups/mysql 2>/dev/null && [[ -w /var/backups/mysql ]]; then
    MODE=droplet
  else
    MODE=dev
  fi
fi

# Preflight: the dump needs the MySQL client. Fail with a clear, actionable message.
if ! command -v mysqldump >/dev/null 2>&1; then
  echo "Error: 'mysqldump' no está instalado. Instala el cliente de MySQL (p. ej. 'sudo apt install mysql-client') y vuelve a intentarlo." >&2
  exit 1
fi

if [[ "$MODE" == droplet ]]; then
  # --- Droplet / cron: full dump + offsite (plan §7.4). ---
  DEST=/var/backups/mysql
  mkdir -p "$DEST"
  mysqldump --single-transaction --quick --routines --triggers --events \
    --databases Evergreen \
    | gzip -9 > "$DEST/achievers-$TS.sql.gz"
  # Retention: keep 14 days local
  find "$DEST" -name 'achievers-*.sql.gz' -mtime +14 -delete
  # Offsite sync (Backblaze B2 via rclone)
  rclone copy "$DEST/achievers-$TS.sql.gz" b2:achievers-backups/db/
  echo "Backup creado: $DEST/achievers-$TS.sql.gz"
  exit 0
fi

# --- Dev: pre-migration dump through the SSH tunnel (plan §7.7.3). ---
# Load .env so DATABASE_URL (the tunnel connection) is available to this shell.
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Error: falta DATABASE_URL. Configúralo en .env apuntando al túnel SSH (mysql://usuario:clave@127.0.0.1:3306/Evergreen) y abre el túnel antes de respaldar." >&2
  exit 1
fi

DEST="${BACKUP_DIR:-$ROOT/backups}"
mkdir -p "$DEST"

# Derive a [client] options file from DATABASE_URL so the password never appears
# on the command line / in the process list. mode 0600, removed on exit.
CNF="$(mktemp)"
trap 'rm -f "$CNF"' EXIT
DB="$(node -e '
  const fs = require("node:fs");
  const u = new URL(process.argv[1]);
  // Quote values and escape backslashes/quotes for MySQL option-file syntax.
  const q = (s) => `"${decodeURIComponent(s).replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
  fs.writeFileSync(
    process.argv[2],
    `[client]\nhost=${u.hostname}\nport=${u.port || 3306}\nuser=${q(u.username)}\npassword=${q(u.password)}\n`,
    { mode: 0o600 },
  );
  process.stdout.write(u.pathname.replace(/^\//, ""));
' "$DATABASE_URL" "$CNF")"

if [[ -z "$DB" ]]; then
  echo "Error: DATABASE_URL no incluye el nombre de la base de datos (esperado .../Evergreen)." >&2
  exit 1
fi

# Privilege-safe flags for a least-privilege dev user (SELECT/INSERT/UPDATE/DELETE,
# plan §7.7.2): --no-tablespaces avoids the global PROCESS grant, --skip-triggers
# avoids TRIGGER, and routines/events are omitted (need extra grants). The droplet
# cron keeps producing the full dump.
mysqldump --defaults-extra-file="$CNF" \
  --single-transaction --quick --no-tablespaces --skip-triggers \
  --databases "$DB" \
  | gzip -9 > "$DEST/achievers-$TS.sql.gz"
# Retention: keep 14 days local
find "$DEST" -name 'achievers-*.sql.gz' -mtime +14 -delete
echo "Backup de desarrollo creado: $DEST/achievers-$TS.sql.gz (sin sincronización offsite)."

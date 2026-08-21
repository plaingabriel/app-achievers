# Runbook — read-only metrics DB user

How to give someone outside the dev team a MySQL connection to build a metrics
app, without exposing `Evergreen` itself. The user reads a separate `Metricas`
schema made of aggregate views; the production tables stay unreachable.

**Why views instead of `GRANT SELECT ON Evergreen.*`:** plain read-only still
hands over every lead's `nombre`, `correo` and `telefono` (plan §10, RGPD), and
still lets an unindexed query saturate the MySQL the Express server depends on.
Views scoped to aggregates remove both. See also
`docs/adr/0010-dev-via-ssh-tunnel.md` and plan §7.7.

## 1. Create the views

`scripts/metrics-views.sql` creates the `Metricas` schema and its views. It is
**not** a Drizzle migration — never run it through `pnpm db:migrate`. It only
issues `CREATE DATABASE` / `CREATE OR REPLACE VIEW`; nothing inside `Evergreen`
is altered and the frozen tables are only read.

On the droplet:

```bash
sudo mysql < scripts/metrics-views.sql
```

Run it as an account that holds `SELECT` on `Evergreen` (`sudo mysql` is
`root@localhost`). That account becomes the views' `DEFINER`, and
`SQL SECURITY DEFINER` is what lets the metrics user read them without any
privilege on the base tables. If that account is ever dropped, the views stop
working — re-run the script as the new owner.

## 2. Create the OS user (SSH tunnel only)

MySQL is bound to `127.0.0.1`, so access goes through a tunnel.

```bash
sudo useradd -m -s /usr/sbin/nologin woker
sudo mkdir -p /home/woker/.ssh
sudo chmod 700 /home/woker/.ssh
```

Add their public key to `/home/woker/.ssh/authorized_keys`, restricted so that
key can only forward MySQL and nothing else:

```
restrict,port-forwarding,permitopen="127.0.0.1:3306" ssh-ed25519 AAAA...clave... woker
```

```bash
sudo chown -R woker:woker /home/woker/.ssh
sudo chmod 600 /home/woker/.ssh/authorized_keys
```

`restrict` disables shell, PTY, agent and X11 forwarding; `permitopen` blocks
tunnels to any other host or port on the droplet.

## 3. Create the MySQL user

Check how MySQL resolves hosts first — `ON` means use `'127.0.0.1'`, `OFF`
(the default) means `'localhost'`:

```bash
sudo mysql -e "SHOW VARIABLES LIKE 'skip_name_resolve';"
```

Generate the password with `openssl rand -base64 24`, then:

```sql
CREATE USER 'woker'@'localhost' IDENTIFIED BY '<password>';

-- Only the views. No privilege of any kind on `Evergreen`.
GRANT SELECT, SHOW VIEW ON `Metricas`.* TO 'woker'@'localhost';

-- Blast radius for a runaway query loop.
ALTER USER 'woker'@'localhost'
  WITH MAX_USER_CONNECTIONS 5 MAX_QUERIES_PER_HOUR 5000;

FLUSH PRIVILEGES;
```

`SHOW VIEW` only exposes the view definitions (no data) and keeps GUI clients
from erroring while they introspect the schema. New views added to `Metricas`
later are covered by the same grant — no re-grant needed.

Verify:

```sql
SHOW GRANTS FOR 'woker'@'localhost';
```

```bash
mysql -h 127.0.0.1 -P 3306 -u woker -p Metricas -e "SHOW TABLES;"
mysql -h 127.0.0.1 -P 3306 -u woker -p Evergreen -e "SHOW TABLES;"   # must fail
```

The second command must fail with `ERROR 1044`. If it does not, the grant is
wrong — fix it before handing over the credentials.

## 4. Hand over

Send over a secure channel (Bitwarden, never Slack or plain email): droplet IP,
SSH user `woker`, MySQL user, password, schema `Metricas`.

The practical setup for a non-technical user is a GUI client with built-in SSH
tunnelling (TablePlus, DBeaver, MySQL Workbench) — no terminal involved:

- SSH host `<droplet-ip>`, user `woker`, their private key
- MySQL host `127.0.0.1`, port `3306`, database `Metricas`

From the terminal it is the usual two steps:

```bash
ssh -N -L 3306:127.0.0.1:3306 woker@<droplet-ip>
mysql -h 127.0.0.1 -P 3306 -u woker -p Metricas
```

## 5. Adding a metric later

Add the view to `scripts/metrics-views.sql`, keep it aggregated and PII-free,
commit, and re-run the script. `CREATE OR REPLACE` makes it idempotent.

## 6. Revoke

On departure, suspected leak, or when the metrics app is retired
(see `rotate-credentials.md`):

```bash
sudo userdel -r woker
sudo mysql -e "DROP USER 'woker'@'localhost';"
```

The `Metricas` schema can stay; without a grantee it is unreachable.

## Known limits

- **No per-user query timeout.** MySQL scopes `max_execution_time` per session
  or globally, not per account, and raising it globally would also affect the
  dashboard. `MAX_USER_CONNECTIONS` is the practical guard: a runaway client
  starves itself, not production.
- **Views are computed on every query.** They scan the base tables. If
  `registros` grows enough that this shows up in dashboard latency, move the
  aggregates into real tables refreshed by a nightly job and repoint the views.
- `FLUSH USER_RESOURCES;` resets the hourly counter if the limit is hit
  legitimately.

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
sudo mysql --defaults-file=/etc/mysql/debian.cnf < ~/metrics-views.sql
```

**`sudo mysql` alone does not work here:** `root@localhost` on this droplet
authenticates by password, not by socket, so it fails with `ERROR 1045`. Use
`debian-sys-maint` via `/etc/mysql/debian.cnf` — it holds `SELECT` on `*.*`
plus `CREATE VIEW`, `CREATE USER` and `GRANT OPTION`, which covers every step
in this runbook. Apply the same `--defaults-file` flag to the `mysql` calls
below.

That account becomes the views' `DEFINER`, and `SQL SECURITY DEFINER` is what
lets the metrics user read them without any privilege on the base tables.
Package upgrades rotate its password but keep the account, so the views keep
working; if it were ever dropped, re-run the script as the new owner.

The droplet is not a git clone (see `deploy.md` — build-on-runner + rsync), so
the script only lands there on a deploy. To run it without deploying, copy it
to the sudo-capable account's home first: `scp scripts/metrics-views.sql
deploy@<droplet>:~/`. Avoid `/tmp` — its sticky bit blocks one account from
overwriting a file another account left there.

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
sudo mysql --defaults-file=/etc/mysql/debian.cnf -e "SHOW VARIABLES LIKE 'skip_name_resolve';"
```

Generate the password with `openssl rand -base64 24`, then open a prompt with
`sudo mysql --defaults-file=/etc/mysql/debian.cnf` and run:

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

## 5. HTTPS access when the client cannot open a tunnel

Sections 2–4 assume a client that can hold an SSH connection. A panel deployed
on a PaaS cannot: MySQL is bound to `127.0.0.1`, and on Railway the egress IP of
the Pro plan is fixed but **shared with other customers**, so an IP allowlist
would admit every other tenant behind that address. Those deployments read the
same views over HTTPS, from the dashboard:

Three endpoints, all behind the same `x-api-key`. The first two let a panel
discover what to draw instead of carrying hard-coded ids and metric names.

### `GET /api/public/proyectos`

```
GET https://app.achievers.es/api/public/proyectos
x-api-key: <METRICS_API_KEY>
```

```json
[
  {
    "id": 4,
    "nombre": "[0926] Lanzamiento - Desafio Importador",
    "activo": true,
    "fechaAlta": "2026-07-20",
    "ultimoRegistro": "2026-09-05",
    "registros": 136262
  }
]
```

Every project in `Metricas`.`v_proyectos`, ordered by name, so one created in the
dashboard appears on the next request without anyone loading its id by hand.
The internal config columns of `proyecto` (`meta_metrics_url`, sheet ids, sales
codes) are not in that view and cannot leak here.

- **`activo` is derived, not stored.** `proyecto` has no such column. It is true
  when the project saw a registro in the last 30 days, or was created inside that
  window and has not had time to — otherwise a project created today would be
  listed as inactive, which is the very case this endpoint exists to serve.
  `ultimoRegistro` and `fechaAlta` come along so a panel that wants a different
  threshold applies its own instead of inheriting this one.
- `registros` is the lifetime total of registration rows, **not unique people**;
  the same address registering twice counts twice. Uniqueness lives only in
  `v_registros_por_origen.correos_unicos`, which this endpoint does not serve.
- `ultimoRegistro` is `null` for a project with no registro yet.

### `GET /api/public/metricas`

```
GET https://app.achievers.es/api/public/metricas
x-api-key: <METRICS_API_KEY>
```

```json
[
  {
    "id": "registros",
    "nombre": "Registros",
    "unidad": "cantidad",
    "agregacion": "suma",
    "mejor": "alto",
    "descripcion": "Altas de registro por día.",
    "agrupaciones": ["origen"]
  }
]
```

The catalogue of what `/series` can serve. `id` is the value to pass in
`?metrica=`; `unidad` is `cantidad`, `usd` or `pct`; `agregacion` (`suma`,
`promedio`, `ultimo`) says how to fold several days into one number; `mejor`
(`alto`, `bajo`) which direction is good; `agrupaciones` lists the values
`?agrupar=` accepts **for that metric** — the grupos series has no origin
breakdown, so asking for one is a `400` rather than a silently ungrouped answer.

It is generated from the same constant `?metrica=` is validated against
(`METRICS_CATALOG` in `src/lib/proyectos-registros-api.ts`), so a metric cannot
be advertised here and then rejected there.

**`telefonos_unicos` is deliberately absent.** It is a distinct count: adding two
days — or two campaigns within a day — double counts a phone present in both,
and no value of `agregacion` describes that honestly. A metric that cannot be
folded correctly does not belong in a catalogue whose whole point is that the
panel folds it.

**There are no Meta metrics here, and there is no way to add them today.**
`inversión`, `clics` and `leads` are not stored anywhere in `Evergreen`: the
dashboard reads them live from a Google Sheet proxy per project
(`proyecto.meta_metrics_url` + `meta_metrics_sheet_id` + `meta_metrics_sheet_index`,
see `fetchProjectMetaGoalMetrics`), and that proxy answers **one aggregate for a
date range**, not a day-by-day series. Serving them per day would mean either one
HTTP call per day of the window, or an ingest job writing daily snapshots into a
new table. Neither is in place; see "Meta metrics" under Known limits.

### `GET /api/public/proyectos/<proyectoId>/series`

```
GET https://app.achievers.es/api/public/proyectos/<proyectoId>/series
    ?metrica=<id de /api/public/metricas>  (optional, default registros)
    &desde=AAAA-MM-DD&hasta=AAAA-MM-DD     (optional)
    &agrupar=origen                        (optional)

x-api-key: <METRICS_API_KEY>
```

One row per day, or per day and origin with `agrupar=origen`:

```json
[
  { "dia": "2026-09-01", "origen": "instagram", "valor": 34 },
  { "dia": "2026-09-01", "origen": "facebook", "valor": 12 }
]
```

What it guarantees, and what it does not:

- `dia` is the string `AAAA-MM-DD`, formatted by MySQL (`DATE_FORMAT`) and never
  a timestamp. Returning a `DATETIME` would let the client rebuild it in its own
  timezone and move a registro of the 1st to the 31st.
- The numbers come from `Metricas`.`v_registros_diarios`, `v_encuestas_diarias`,
  `v_encuestas_diarias_por_origen` and `v_grupos_por_campana` — the very views
  the tunnel serves, so the panel and the dashboard cannot disagree on a day.
- `metrica=grupos` counts a day by `grupos.fecha`, the date the assignment is
  *for*, while every other metric counts by `created_at`. A batch loaded in
  advance therefore lands on its own day, which is what the panel wants to plot
  and what makes the two series non-comparable day by day.
- `origen` is present only with `agrupar=origen`, and only for the metrics whose
  `agrupaciones` in the catalogue include it.
- Days with nothing to report are absent, not zero; `metrica=score` also omits
  the days where no survey carried a score.
- `agrupar=origen` on `encuestas`/`score` reaches the origin through
  `registros`, so a survey whose `contact_id` matches no registro is counted in
  the ungrouped series and missing from the grouped one. On `registros` there is
  no such gap.
- Default window: the last 90 days. Maximum: 366 days per request — the cap
  also holds for a one-sided range: `?desde=` with no `?hasta=` is measured
  against today, so it cannot widen the window past the limit.
- Responses carry `cache-control: private, max-age=60`.
- No CORS headers: this is server-to-server. Calling it from the browser would
  publish the key.

The key is `METRICS_API_KEY` (`openssl rand -base64 32`), set in the dashboard
environment and handed over like any other credential — §4. **Never hand over
`PUBLIC_STATS_API_KEY` instead:** that one also opens `/origenes` and
`/resumen`, which accept `field=correo|telefono|nombre` and would return exactly
the personal data this runbook exists to withhold.

The endpoint runs as the dashboard's own MySQL user (`DATABASE_URL`), which has
no privilege on `Metricas` until it is granted one:

```sql
GRANT SELECT ON `Metricas`.* TO '<usuario-del-dashboard>'@'localhost';
FLUSH PRIVILEGES;
```

Without the grant the endpoint answers `503` saying so. It never falls back to
reading `Evergreen` directly: that would silently produce a second number
computed a second way, which is the one thing this design is meant to prevent.
`Evergreen` is touched only to resolve an unknown `proyectoId` into a `404`,
never to compute a value.

Verified in production on 2026-09-05: the nine views in place, the grant
working, `401` / `403` / `400` on a missing key, a wrong key and an over-wide
range, and seven closed days matching `v_registros_diarios` one for one (the
day in progress differs by whatever arrives between the two queries).

## 6. Adding a metric later

Add the view to `scripts/metrics-views.sql`, keep it aggregated and PII-free,
commit, and re-run the script. `CREATE OR REPLACE` makes it idempotent.

If the panel also has to reach it over HTTPS, three edits, all in the same
commit, in `src/lib/proyectos-registros-api.ts` unless noted:

1. Declare the view in `src/db/metrics-views.ts` — read-only, `.existing()`, and
   never re-exported from the schema barrel.
2. Add the entry to `METRICS_CATALOG`, with the `agrupaciones` the series can
   actually answer. This is the step that makes it appear in the panel: nothing
   there has to change.
3. Teach `selectMetricsSeries` to reach it.

Validation of `?metrica=` reads the catalogue, so step 2 is also what stops the
new id from being rejected. Skipping step 3 turns an advertised metric into a
runtime failure, which is why they belong together.

Before adding one, check it survives being folded: `agregacion` has to describe
the truth. A distinct count (`correos_unicos`, `telefonos_unicos`) does not —
summing two days double counts anything present in both — so it stays out.

## 7. Revoke

On departure, suspected leak, or when the metrics app is retired
(see `rotate-credentials.md`):

```bash
sudo userdel -r woker
sudo mysql --defaults-file=/etc/mysql/debian.cnf -e "DROP USER 'woker'@'localhost';"
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
- **`MAX_QUERIES_PER_HOUR` does not cover the HTTPS route.** The series
  endpoint queries as the dashboard user, not as the metrics account, so that
  cap does not apply to it. Its brakes are the 366-day range limit and the
  60-second cache.
- **Meta metrics are not in the database.** Spend, clicks and leads never land
  in `Evergreen`: the dashboard fetches them live per project from a Google
  Sheet proxy (`proyecto.meta_metrics_url`), which answers a single aggregate
  for a date range and has no day-by-day mode. So `/api/public/metricas` cannot
  list them and `/series` cannot serve them. Doing so needs one of two things
  built first: a daily mode on that proxy, or a table of daily snapshots filled
  by a scheduled job and a view over it. Until then the panel gets Meta numbers
  the way the dashboard does — from the sheet, per range, not per day.
- **Origins are stored as they arrive.** Some campaign wrote the literal
  `{{ad.name}}` into `registros.origen` (an ad-platform placeholder that was
  never substituted), and it shows up as one more origin in every view and in
  `agrupar=origen`. Nothing downstream should paper over it: fix it at the
  source, and correct the existing rows with a targeted `UPDATE` on
  `registros` if the campaign it belongs to can be identified.

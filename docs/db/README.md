# Database — `Evergreen` (MySQL)

Shared with the existing Express server, on the production droplet, bound to
`127.0.0.1` only. Dev connects via SSH tunnel (see repo README).

## Tables
- **Existing, schema-frozen, data-editable:** `Personas`, `Closers`, `Calendarios`
  (declared in `src/db/schema/existing.ts`; excluded from migrations).
- **Better Auth:** `user`, `session`, `account`, `verification`, `two_factor`.
- **RBAC:** `role`, `permission`, `role_permission`, `user_role`.
- **App:** `invitation`, `audit_log`, `error_log`, `proyecto`, `registros`,
  `encuestas`, `grupos`, `metricas_historicas` (totals typed in by hand for
  launches that predate the dashboard — see ADR 0015).
- **Written by another process:** `meta_ads_diarias` (by `server-achievers`),
  `acs_ventas_diarias` + `acs_ventas_producto_diarias` (by the dashboard's own
  cron, mirroring the sales platform), and `registros` + `encuestas` + `grupos`
  (by the landing forms and the SendFlow sendhook, over the public ingest
  endpoints).

See `ownership.md` for the data-vs-schema ownership split, and one contract file
per table whose rows come from outside the app's own screens: `error_log.md`,
`meta_ads_diarias.md`, `acs_ventas_diarias.md`, `metricas_historicas.md` and
`ingesta-publica.md` (the three public `POST` endpoints).

# Database — `Evergreen` (MySQL)

Shared with the existing Express server, on the production droplet, bound to
`127.0.0.1` only. Dev connects via SSH tunnel (see repo README).

## Tables
- **Existing, schema-frozen, data-editable:** `Personas`, `Closers`, `Calendarios`
  (declared in `src/db/schema/existing.ts`; excluded from migrations).
- **Better Auth:** `user`, `session`, `account`, `verification`, `two_factor`.
- **RBAC:** `role`, `permission`, `role_permission`, `user_role`.
- **App:** `invitation`, `audit_log`, `error_log`, `proyecto`, `registros`,
  `encuestas`, `grupos`.
- **Written by another process:** `meta_ads_diarias` (by `server-achievers`),
  `acs_ventas_diarias` + `acs_ventas_producto_diarias` (by the dashboard's own
  cron, mirroring the sales platform).

See `ownership.md` for the data-vs-schema ownership split, and one contract file
per table written by a process that does not own its schema: `error_log.md`,
`meta_ads_diarias.md`, `acs_ventas_diarias.md`.

# Database — `Evergreen` (MySQL)

Shared with the existing Express server, on the production droplet, bound to
`127.0.0.1` only. Dev connects via SSH tunnel (see repo README).

## Tables
- **Existing, schema-frozen, data-editable:** `Personas`, `Closers`, `Calendarios`
  (declared in `src/db/schema/existing.ts`; excluded from migrations).
- **Better Auth:** `user`, `session`, `account`, `verification`, `two_factor`.
- **RBAC:** `role`, `permission`, `role_permission`, `user_role`.
- **App:** `invitation`, `audit_log`, `error_log`.

See `ownership.md` for the data-vs-schema ownership split and `error_log.md`
for the cross-emitter contract.

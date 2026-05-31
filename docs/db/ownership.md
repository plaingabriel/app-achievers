# Schema ownership

The dashboard owns the schema and all migrations. The Express server treats the DB as one integration among many.

| Table category | Owner | Migrations | Express server |
|---|---|---|---|
| `Personas`, `Closers`, `Calendarios` | Co-owned, **frozen** | Neither repo alters without coordination | Reads + writes as today |
| Better Auth, `role`, `permission`, `role_permission`, `user_role`, `invitation`, `audit_log` | Dashboard | Dashboard's Drizzle migrations | None (dashboard-private) |
| `error_log` | Dashboard (schema) | Dashboard's migrations | **Writes** (see `error_log.md`) |
| Future event/client-data tables | Dashboard | Dashboard's migrations | Per-table when introduced |

The frozen tables are excluded from generation via `tablesFilter` in `drizzle.config.ts`.

## Changing a frozen table
1. PR in the dashboard repo with a written impact statement.
2. Both maintainers review.
3. Coordinated deploy of any matching Express change.
Expected to be rare.

## Adding a dashboard table the Express server must touch
1. Dashboard ships the migration first.
2. Document the schema here in `docs/db/`.
3. Express server updates its raw SQL / types to match.

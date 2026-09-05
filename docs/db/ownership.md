# Schema ownership (plan §4.1)

Two separate ideas — do not conflate them:

- **Data ownership (rows):** the dashboard has **full CRUD on every production
  table**, including the three existing ones, via the UI (authorization-gated by
  `user.is_admin` / `user_permission` per ADR 0014, audited).
- **Schema ownership (structure):** the dashboard authors migrations only for
  its own tables. `Personas`, `Closers`, `Calendarios` are **schema-frozen** —
  no generated `ALTER`/`DROP`. Enforced by `tablesFilter` in `drizzle.config.ts`.

| Table | Data CRUD | Schema owner | Express server |
|---|---|---|---|
| `Personas`, `Closers`, `Calendarios` | Full CRUD (UI) | Frozen — coordinate before any structure change | Read + write as today |
| Better Auth / `user_permission` / `invitation` / `audit_log` | App logic | Dashboard migrations | None |
| `error_log` | UI read + app writes | Dashboard migrations | **Writes** (see `error_log.md`) |
| `meta_ads_diarias` | Read-only for the dashboard | Dashboard migrations | **Writes** (see `meta_ads_diarias.md`) |

Any structural change to a frozen table requires a written impact statement and
review. Editing rows is a normal, everyday operation needing no PR.

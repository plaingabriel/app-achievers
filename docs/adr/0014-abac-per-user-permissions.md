# ADR 0014 — Per-user permissions (admin flag + per-table grants)

- **Status:** Accepted
- **Date:** 2026-06-06
- **Supersedes:** [ADR 0003](0003-rbac-multi-role.md) (RBAC — multi-role per user)

## Context

The original design (ADR 0003) modelled authorization as named roles
(`admin`/`editor`/`viewer`) bundling `resource:action` permissions, with
multiple roles per user. In practice the team needs **per-person** access: a
given editor should act on *some* data tables but not others (e.g. one person
manages Closers only, another manages Personas + Calendarios). Roles *can*
express this, but only by minting a role per combination — awkward to manage for
a small (<50 user) internal tool.

## Decision

Drop roles entirely. Authorization is now:

- **Admin** — a boolean `user.is_admin` superuser flag. Admins implicitly hold
  every permission: all data tables **and** the admin-only management screens
  (members, permissions, invitations, logs, audit). They are the only ones who
  can change other users' access.
- **Everyone else** — an explicit per-user list of `resource:action` grants over
  the **data tables only** (`personas`, `closers`, `calendarios` ×
  `read`/`write`/`delete`), stored in a `user_permission` table. The management
  screens are not grantable — they are reachable by admins only.

Access is resolved fresh per request by `resolveAccess(userId)` →
`{ isAdmin, permissions }` (`src/lib/rbac.ts`); admins also resolve to the full
grantable set so page-level `permissions.includes(...)` checks light up.

Two enforcement gates:
- **Admin-only** routes/server functions → `requireAdmin` / `assertAdmin`.
- **Per-table** routes/server functions → `requirePermission` / `assertPermission`,
  which pass if the caller is an admin **or** holds the specific grant.

Invitations carry the access to apply on accept: an `is_admin` flag or a
`permissions` JSON list. New admins are created either by the "invite as admin"
checkbox or by the admin toggle on the `/permissions` screen (with a last-admin
lockout guard). The screen formerly at `/roles` is renamed `/permissions`
("Permisos").

## Consequences

- Far simpler to reason about: "this person can write Personas" is one row, not a
  bespoke role.
- **Error-log and audit viewers are now admin-only.** Non-admin editors lose the
  read access they had under the old `editor`/`viewer` roles — an accepted
  trade-off for the simpler model.
- The `role` / `permission` / `role_permission` / `user_role` tables are dropped;
  `user` gains `is_admin`; `invitation` swaps `role_id` for `is_admin` +
  `permissions`. Migration `drizzle/0001_rbac_to_abac.sql` backfills existing
  users (admin-role holders → `is_admin`; everyone else's data-table grants →
  `user_permission`) before dropping the old tables.
- Permission resolution still happens fresh per request, so a grant change takes
  effect on the user's next navigation.

# Phase 06 — Authorization (admin flag + per-user permissions)

> Reflects [ADR 0014](../adr/0014-abac-per-user-permissions.md). Originally an
> RBAC phase; the role model was replaced with per-user permissions.

## Goal
Resolve access and gate pages/features; admin UI to configure per-user grants.

## Model
- `user.is_admin` — superuser; implicitly holds everything, reaches the
  admin-only screens, and is the only one who can change others' access.
- `user_permission` — per-user `resource:action` grants over the data tables
  (`personas`, `closers`, `calendarios`) for everyone else.

## Batch (small, do in order)
1. Resolve access with `resolveAccess` in the root route / server functions.
2. Gate routes: `requireAdmin` for management screens (members, permissions,
   invitations, logs, audit); `requirePermission` for the data tables (admin OR
   the grant). Hide unreachable nav in the Sidebar.
3. Build the admin `/permissions` screen: per-user grant matrix + admin toggle
   (with a last-admin lockout). Invitations carry the initial access.

## Files
`src/lib/rbac.ts`, `src/lib/permissions.ts`, `src/lib/server-rbac.ts`,
`src/lib/route-guards.ts`, `src/components/Sidebar.tsx` (gating),
`src/routes/permissions/*`.

## How to validate
- A user with only `personas:read`/`write` sees just Personas; cannot delete and
  cannot reach `/closers` or any admin-only page (redirected to `/`).
- An admin reaches every page and edits grants on `/permissions`.
- Changing a user's grants (or admin flag) takes effect on their next request.
- Demoting / suspending / deleting the last admin is blocked.

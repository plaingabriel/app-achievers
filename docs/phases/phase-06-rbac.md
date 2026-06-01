# Phase 06 — RBAC (roles, permissions, gating)

## Goal
Resolve permissions and gate pages/features; admin UI to configure roles.

## Batch (small, do in order)
1. Use `getUserPermissions` in a route guard / server middleware.
2. Hide/disable nav + actions by permission; `delete` is admin-only.
3. Build the admin roles screen (assign roles, edit role permissions).

## Files
`src/lib/rbac.ts, src/components/Sidebar.tsx (gating), src/routes/roles/*`

## How to validate
- A `viewer` cannot see/reach admin-only pages; an `admin` can.
- Editor can create/update data rows but cannot delete.
- Changing a role's permissions takes effect on next request.

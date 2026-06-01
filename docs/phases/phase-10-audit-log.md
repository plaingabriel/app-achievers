# Phase 10 — Audit log (sensitive events)

## Goal
Record sensitive auth/RBAC events; enforce visibility.

## Batch (small, do in order)
1. Emit audit entries for login/2FA/invitation/role/user/session events (plan §4.5).
2. Build the append-only viewer: users see own rows; admins see all (`audit:read_all`).
3. Ensure no update/delete path exists from the app.

## Files
`src/lib/audit.ts (new), src/routes/audit/*, hook points in auth/rbac/invitations`

## How to validate
- Logging in writes `login.success`; a failed attempt writes `login.failure`.
- A non-admin sees only their own audit rows; an admin sees everyone's.
- There is no UI or API to edit/delete audit rows.

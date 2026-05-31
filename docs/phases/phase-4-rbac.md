# Phase 4 — RBAC

**Goal:** permission middleware + admin UI for roles/permissions/users, page-level gating.

**Prerequisites:** Phase 3.
**Implements:** ADR 0003.

## Tasks
- [ ] Permission resolver: user → roles → unioned permissions, cached per request.
- [ ] Middleware/guard for server functions and routes that checks a required permission string (e.g. `members:write`).
- [ ] Navigation hides pages the user lacks `*:read` for.
- [ ] Admin UI: list/create/edit roles (block deleting `is_system`), assign permissions (checkbox matrix), assign multiple roles to a user.
- [ ] Audit page: `/audit` — `audit:read` shows own rows, `audit:read_all` shows all. Append-only.
- [ ] Build all UI with the design system (read the skill first).

## Acceptance criteria
- A `viewer` cannot reach or mutate write-gated pages (server-enforced, not just hidden).
- Admin can create a role, grant permissions, assign it — effective immediately.
- `is_system` roles can't be deleted.

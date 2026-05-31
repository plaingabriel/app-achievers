# ADR 0003: Multi-role RBAC, admin-configurable, page-level

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Access control is about page/feature visibility (not row-level filtering). Admins must be able to create roles and edit permissions through the UI, not via code deploys.

## Decision

Shape B — a user can hold multiple roles; permissions are the union. Tables: `role`, `permission`, `role_permission`, `user_role`. Seed `admin` (is_system), `editor`, `viewer`. Permissions are (resource, action) pairs, e.g. `("logs","read")`. Page gating checks permissions via middleware. Audit visibility uses two permission strings: `audit:read` (own rows) and `audit:read_all` (admin, all rows).

## Consequences

- One extra join vs. single-role; invisible at <50 users.
- Admin UI for roles/permissions is straightforward (multi-select).
- `is_system` roles can't be deleted from the UI.

## Alternatives considered

Single-role-per-user (would need a migration to add multi-role later), JSON permissions column (no integrity, JSON-editor UI) — both rejected.

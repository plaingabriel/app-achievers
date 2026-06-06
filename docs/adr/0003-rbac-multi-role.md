# ADR 0003 — RBAC — multi-role per user (Shape B)

- **Status:** Superseded by [ADR 0014](0014-abac-per-user-permissions.md) (2026-06-06)
- **Date:** 2026-05-31

> **Superseded.** Roles were dropped in favour of a per-user model: a `user.is_admin`
> superuser flag plus per-table `resource:action` grants in `user_permission`.
> See ADR 0014. The text below is kept for historical context.

## Context
We need page/feature visibility control, admin-configurable, for <50 users.

## Decision
Model RBAC as role / permission / role_permission / user_role with multiple roles per user. Seed admin/editor/viewer.

## Consequences
Flexible and admin-configurable. `delete` is admin-only by default; editor = read+write; viewer = read.

# ADR 0003 — RBAC — multi-role per user (Shape B)

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
We need page/feature visibility control, admin-configurable, for <50 users.

## Decision
Model RBAC as role / permission / role_permission / user_role with multiple roles per user. Seed admin/editor/viewer.

## Consequences
Flexible and admin-configurable. `delete` is admin-only by default; editor = read+write; viewer = read.

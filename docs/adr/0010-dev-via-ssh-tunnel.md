# ADR 0010 — Dev connects to Evergreen prod via SSH tunnel

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
There is no separate dev DB; dev must exercise the app against real data, and prod MySQL is not publicly exposed.

## Decision
Dev forwards local 3306 to the droplet's 127.0.0.1:3306 over SSH and points DATABASE_URL at the tunnel.

## Consequences
No public MySQL port. Working against production: never db:push, back up before migrate, never ALTER frozen tables (relaxed controls, plan §7.7).

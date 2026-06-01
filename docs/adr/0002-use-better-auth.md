# ADR 0002 — Use Better Auth for auth + 2FA

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
Invitation-only access, sessions, TOTP 2FA + backup codes, password reset — without rolling our own.

## Decision
Use Better Auth (v1.4+) with the twoFactor plugin and the Drizzle adapter. Public signup disabled; users arrive via invitations.

## Consequences
Auth tables are declared in Drizzle and owned by the dashboard's migrations; reconcile columns with the Better Auth CLI.

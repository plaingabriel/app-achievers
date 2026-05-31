# ADR 0002: Better Auth for authentication

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Need email+password + TOTP 2FA, invitation-only signup, sessions, password reset. Must be free, in-process (one program), keep all data in our own MySQL, and not lock us to a vendor.

## Decision

Use Better Auth (v1.4+) with the Drizzle adapter (MySQL), the `twoFactor` plugin (TOTP + backup codes), and the TanStack Start cookies integration. No public signup — registration is gated behind invitations (ADR 0003 supplies the role).

## Consequences

- Auth tables (`user`, `session`, `account`, `verification`, `twoFactor`) are managed by Better Auth and live in our DB. We extend `user` with `persona_id` (ADR 0004) and `status`.
- We own all auth data; no third-party identity provider.
- Newer library — fewer Stack Overflow answers; rely on official docs.

## Alternatives considered

Roll-your-own (4x the code, security risk), Lucia (deprecated), Auth.js (awkward outside Next, thin RBAC), Clerk/Auth0/Supabase Auth (vendor lock-in — rejected).

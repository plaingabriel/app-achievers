# Phase 3 — Authentication

**Goal:** email+password login, TOTP 2FA, invitation-only signup, password reset, first-admin seed.

**Prerequisites:** Phase 2.
**Implements:** ADR 0002, 0009.

## Tasks
- [ ] Configure Better Auth in `src/lib/auth.ts`: Drizzle adapter (MySQL), `twoFactor` plugin (TOTP + backup codes), TanStack Start cookies integration, email+password enabled, **public signup disabled**.
- [ ] Wire the auth handler route and client.
- [ ] Implement the invitation flow: admin creates an invite (`invitation` table) → email via `sendEmail()` → invitee sets password + enrolls TOTP → `user` created with the invite's role.
- [ ] Implement `src/lib/email.ts` templates (invite, reset, backup codes) — sentence case, no emoji, brand voice.
- [ ] Implement `scripts/seed.ts`: refuse if any user exists; create roles + permissions; create one admin with a random one-time password printed to stdout; `must_change_password = true`; grant `admin`; write an audit entry.
- [ ] Enforce post-first-login: change password, enroll TOTP.
- [ ] Emit audit-log events for all auth actions (list in `plan.md` §4.5 / ADR 0003).

## Acceptance criteria
- Seed creates exactly one admin; re-running refuses.
- Login requires password + TOTP; backup codes work.
- No route allows self-registration without an invite.

# Phase 07 — Invitations (invite-only onboarding)

## Goal
Invite users by email via Resend; accept to create an account.

## Batch (small, do in order)
1. Build invite creation (admin) → hashed token + Resend email (`src/lib/email.ts`).
2. Build the accept-invite flow (set password, role from invitation).
3. Expire/revoke invitations; enforce single-use.

## Files
`src/lib/email.ts, src/routes/invitations/*, src/routes/accept-invite/*`

## How to validate
- Admin sends an invite; the email arrives (or is logged in dev no-op).
- Accepting creates the user with the invited role; the token can't be reused.
- Expired/revoked invitations are rejected.

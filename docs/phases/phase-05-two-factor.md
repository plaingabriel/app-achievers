# Phase 05 — Two-factor (TOTP + backup codes)

## Goal
Add TOTP enrollment and verification at login.

## Batch (small, do in order)
1. Enable the twoFactor plugin flows in the client; add an enrollment screen (QR).
2. Add the 2FA challenge step to the login flow; generate backup codes.
3. Mark `must_change_password` admins through password change first.

## Files
`src/lib/auth.ts (twoFactor), src/routes/login.tsx, src/routes/settings/* (enrollment)`

## How to validate
- Admin can enroll TOTP and is shown backup codes once.
- Next login requires a valid TOTP code; a backup code works once.
- Disabling 2FA writes the expected audit events (see phase 10).

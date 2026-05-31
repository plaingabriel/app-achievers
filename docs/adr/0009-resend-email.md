# ADR 0009: Resend for transactional email

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Email is needed for invitations, password reset, and TOTP backup codes — well under 100 messages/month. Must be free and not deeply locked-in.

## Decision

Use Resend (free tier 3,000/month, 100/day). All sending goes through a single `sendEmail()` function in `src/lib/email.ts`, so the vendor can be swapped by editing one file.

## Consequences

- Generous free headroom (~30x our volume).
- One-time domain verification (DNS) required.
- Lock-in is nominal — one module behind an interface.

## Alternatives considered

Brevo, MailerSend, SendGrid (all viable free tiers), AWS SES (cheap not free, more setup), self-hosted Postfix (deliverability/maintenance pain) — Resend chosen for DX.

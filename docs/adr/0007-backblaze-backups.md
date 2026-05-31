# ADR 0007: Backblaze B2 backups + passphrase storage

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

Single droplet = single point of failure. The only copy of all data is the droplet's MySQL. Backups must live off the droplet, be free, and be restorable fast. The `.env` and TLS backups are encrypted; that passphrase must survive both devs losing devices yet stay out of others' hands.

## Decision

Daily `mysqldump` + `rclone` to **Backblaze B2** (free 10 GB tier, S3-compatible). Keep 14 days local, retain offsite. Encrypt `.env`/cert backups with gpg. Store the passphrase in a **Bitwarden free Organization** (everyday access) **plus a sealed paper copy** in a physical secure location (disaster fallback). Rotate annually or on any departure / suspected leak. Quarterly fire drills validate restores.

## Consequences

- Offsite, free, swappable (one rclone remote).
- Recovery target: under 60 minutes via `docs/runbooks/restore-from-backup.md`.
- A backup never test-restored is not a backup — the fire drill is mandatory.

## Alternatives considered

Same-droplet backups (useless on droplet loss), GitHub repo for dumps (hacky), KMS/1Password (cost or lock-in) — rejected.

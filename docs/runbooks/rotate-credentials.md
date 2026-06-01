# Runbook — credential rotation

## Backup-encryption passphrase (plan §7.8 — decided A + G)
Stored in a Bitwarden free org (everyday) + a sealed paper copy (DR fallback).
Rotate **annually**, **on any maintainer departure**, and **immediately on any
suspected leak**. Refresh the sealed paper copy on every rotation.

## Other secrets
- `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, DB passwords: rotate on departure or
  suspected leak. Update `/etc/app-achievers/.env` (chmod 600) and `pm2 reload`.

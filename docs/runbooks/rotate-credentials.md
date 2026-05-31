# Runbook: rotate credentials

Annually, or on any maintainer departure / suspected leak (ADR 0007).

- **Backup-encryption passphrase:** generate a new one, re-encrypt the latest `.env`/cert backups, update the Bitwarden entry, reprint and re-seal the paper copy, destroy the old paper copy.
- **`BETTER_AUTH_SECRET`:** rotating invalidates sessions — expect everyone to re-login. Update `/etc/achievers-app/.env`, reload PM2.
- **`RESEND_API_KEY`:** create a new key in Resend, update `.env`, reload, then revoke the old key.
- **Droplet SSH deploy key:** generate a new pair, update the GitHub secret and the droplet's `authorized_keys`, remove the old.
- **Per-dev MySQL users:** review grants; remove any leftover write grants.

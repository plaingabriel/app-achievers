# ADR 0007 — Backblaze B2 for offsite backups

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
We need free, S3-compatible offsite storage for daily DB dumps.

## Decision
Daily `mysqldump` of Evergreen → local (14-day retention) + Backblaze B2 free tier via rclone.

## Consequences
Cost ~zero at our size. Swapping providers = one rclone remote. Restore runbook in docs/runbooks.

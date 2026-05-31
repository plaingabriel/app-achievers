# Runbook: quarterly fire drill

A backup you've never restored is hope, not a backup. Once a quarter:

1. Spin up a $4/month throwaway droplet.
2. Run `restore-from-backup.md` from scratch against the latest B2 backup.
3. Verify login works and data looks correct.
4. Destroy the droplet.
5. Record anything that broke and fix it before the next drill.

Budget: 30-60 minutes. Log the date and result somewhere durable.

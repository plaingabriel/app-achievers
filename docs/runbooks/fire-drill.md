# Runbook — quarterly fire drill (plan §7.2)

A backup you've never restored is hope, not a backup. Once a quarter:

1. Spin up a $4/mo throwaway droplet.
2. Run `restore-from-backup.md` from scratch.
3. Verify login works and data is correct.
4. Destroy the droplet.
5. Write down what didn't work; fix before the next drill.

~30–60 minutes. Saves you from learning your backup is broken at 2am.

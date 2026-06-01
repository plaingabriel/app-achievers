# ADR 0011 — Backup passphrase storage — A + G

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
The backup-encryption passphrase must survive device loss but not be externally obtainable.

## Decision
Bitwarden free org (everyday access) + a sealed paper copy in a secure physical location (DR fallback). Rotate annually / on departure / on suspected leak.

## Consequences
Belt-and-suspenders, zero cost. Refresh the paper copy on each rotation.

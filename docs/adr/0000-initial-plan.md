# ADR 0000: Initial architecture (omnibus)

- **Status:** Accepted
- **Date:** 2026-05-27
- **Deciders:** the two maintainers

## Context

Greenfield internal admin dashboard for Achievers Academy. Hard constraints: free services only, no runtime vendor lock-in, one fullstack program, React (team familiarity), self-hosted on an existing DigitalOcean droplet shared with a Node/Express server, two maintainers, under 50 invitation-only users.

This ADR is the index. Each significant decision has its own ADR (0001+). The full iterative reasoning lives in `plan.md` at the repo root, archived as the historical record.

## Decision

Build a TanStack Start app (React, TypeScript, Vite) talking to the existing MySQL via Drizzle, with Better Auth for email+password+TOTP, multi-role admin-configurable RBAC, an SSE error-log viewer, Resend for email, PM2 + nginx + certbot on the droplet, GitHub Actions for CI/CD, Backblaze B2 for backups, pnpm 11 + Biome for tooling. Tests deferred.

## Consequences

- One stack end-to-end; shared TS types possible later with the Express server.
- Everything runs as a plain Node process — portable, no lock-in.
- The droplet is a single point of failure, mitigated by the backup/restore runbook.

## Alternatives considered

Next.js (mild Vercel drift, rejected for the no-lock-in spirit), Remix/React Router v7 (strong, lost to TanStack Start on type-safety + neutrality), roll-your-own auth (too much security surface for two devs).

# Phase 02 — Database connectivity (Evergreen via tunnel)

## Goal
Connect Drizzle to the real Evergreen DB through the SSH tunnel and read an existing table.

## Batch (small, do in order)
1. Open the SSH tunnel (README) and set `DATABASE_URL` in `.env`.
2. Bring up the Drizzle client (`src/db/index.ts`) and env validation (`src/lib/env.ts`).
3. Run `pnpm db:studio` and a read query against `Personas`.

## Files
`src/db/index.ts, src/lib/env.ts, drizzle.config.ts, .env`

## How to validate
- `pnpm db:studio` connects and lists existing tables incl. Personas/Closers/Calendarios.
- A `SELECT` on Personas returns rows (incl. the email-style id row).
- `GET /api/healthz` returns 200 with `db:"ok"`.

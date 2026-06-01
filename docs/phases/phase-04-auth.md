# Phase 04 — Authentication (email + password, sessions)

## Goal
Stand up Better Auth and the first admin.

## Batch (small, do in order)
1. Configure `src/lib/auth.ts` (Drizzle adapter, signup disabled) + `auth-client.ts`.
2. Reconcile auth columns with `npx @better-auth/cli generate` if needed.
3. Run `pnpm db:seed` to create the first admin; build the `/login` flow + session gate.

## Files
`src/lib/auth.ts, src/lib/auth-client.ts, src/routes/login.tsx, scripts/seed.ts`

## How to validate
- `pnpm db:seed` prints a one-time password and refuses to run if a user exists.
- Logging in at `/login` creates a session and lands on `/`; logout clears it.
- Unauthenticated access to `/` redirects to `/login`.

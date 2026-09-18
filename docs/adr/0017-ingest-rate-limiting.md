# ADR 0017 — Rate limiting per IP on the public ingest, opt-in per project

- **Status:** Accepted
- **Date:** 2026-09-18

## Context

The three public ingest endpoints (`POST /api/registros`, `/api/encuestas`,
`/api/grupos` — see `docs/db/ingesta-publica.md`) have no authentication. The
only guard is `assertPublicIngestOrigin`, a CORS allowlist that returns early
when the request carries no `Origin` header — which is every server-to-server
call. It stops a hostile web page, not a script.

On 2026-09-18 a single IP (`153.67.183.170`, one mobile Chrome user agent) posted
**240 registros into project 11** (the sorteo popup) over 235 minutes at a steady
2-4 per minute: same landing page, same `origen`, four names, two phones, one
answer to `capital`. Those rows were deleted; nothing prevented them from being
written, and nothing would prevent a repeat.

**The constraint that shapes the whole decision.** Traffic on these endpoints is
of two incompatible kinds, measured on `audit_log` (which stores `ip` and
`user_agent` for every `registro.created`):

| projects | rows | writer | distinct IPs |
|---|---|---|---|
| 1, 2, 4 | ~160.000 | server-to-server, `User-Agent: WordPress/7.x` | 4 fixed DigitalOcean IPs — one sent 144.942 on its own |
| 11 | ~3.100 | the end user's browser | 2.722, ~1,14 rows each |

So one legitimate IP accounts for 144.942 registros. Any limit that applies to it
takes the launch funnel offline.

Per-IP-per-hour distribution of the browser traffic (project 11): 1 → 2.636 IPs,
2 → 81, 3 → 5, 4 → 2, 5 → 1, then a clean gap and 9, 24, 34, 182 — the four
abuses. A threshold of 5/hour separates them without touching a single
legitimate historical submission.

## Decision

A per-IP sliding-window limit in `src/lib/rate-limit.ts`, called from the three
`create*` functions in `src/lib/proyectos-registros-api.ts` right after the
project id is resolved and before any field validation or database work.

**Opt-in per project.** Only the projects listed in
`INGEST_RATE_LIMIT_PROJECTS` (default `11`) are policed. The server-to-server
projects are out of the limiter's reach by construction.

We rejected the obvious alternative — policing everything and exempting the four
WordPress IPs through an allowlist — because of its failure mode. The day that
host's IP changes (droplet rebuild, floating IP move, a new landing site, a CDN
inserted), the 144.942-row caller starts collecting 429s **mid-launch**, and the
failure is invisible except as `error_log` rows nobody is watching. Opt-in fails
the other way: a new browser-facing project is unprotected until someone adds its
id, which is a miss, not an outage, and it is fixed by editing one variable.
`INGEST_RATE_LIMIT_EXEMPT_IPS` remains as an emergency valve, empty by default.

Exempting by `User-Agent: WordPress/*` was rejected outright: a header anyone can
set is not a guard.

**The budget is per `(IP, project)` and shared by the three endpoints**, so
rotating endpoints does not buy three times the quota. It counts **attempts**,
not successes: a malformed body consumes budget too.

**The limiter reads `x-real-ip`, never the first value of `x-forwarded-for`.**
nginx sets `X-Real-IP $remote_addr` (overwriting whatever the client sent) and
`X-Forwarded-For $proxy_add_x_forwarded_for` (**appending** to it). A caller who
sends `X-Forwarded-For: 1.2.3.4` makes the app see `1.2.3.4, <real ip>`, so the
`.split(',')[0]` idiom returns an attacker-chosen value — rotating it per request
would defeat any per-IP limit with one header. The fallback is the **last**
segment of `x-forwarded-for`, the hop nginx appended.

`src/lib/audit.ts:57` still reads the first value. It is left alone deliberately:
that column is a historical display field and changing it would rewrite the
meaning of rows already stored. **Do not copy that idiom into anything that
enforces.**

**Three modes** (`INGEST_RATE_LIMIT_MODE`): `off`, `shadow` (counts and logs,
blocks nothing) and `enforce`. It ships in `shadow`.

State is an in-process `Map` — PM2 runs a single fork process (`instances: 1`),
so there is no shared-state problem. It is swept amortized on the request path
rather than from `src/server/cron.ts`, whose jobs start from the Nitro plugin and
would behave differently under `pnpm dev`.

## Consequences

- **A repeat of the 18/09 incident stops at the fifth request** instead of the
  240th, and it announces itself in `error_log` under `source =
  'ingest-rate-limit'` — one row per key per window, not one per request.
- **A new browser-facing project is unprotected until it is listed.** This is the
  accepted cost of not being able to take the funnel down by accident. Whoever
  launches the next popup adds its id.
- **Counters reset on every `pm2 reload`.** With a one-hour window an abuser
  gains at most one extra window per deploy. Accepted.
- **It fails open** when no IP is readable and when the key map overflows. In
  production nginx always sets the header; failing closed would break local
  verification and would take ingest down the day someone edits the nginx block.
- **It does not solve the sorteo's underlying problem**, which is one email
  registering many times: whoever changes network gets a fresh budget. The remedy
  for that is a unique index on `(proyecto_id, correo)`, which is a migration
  against production and needs a prior decision on whether one email may
  legitimately register twice.
- Volumetric shedding is still absent: the route already parses the body and
  writes an `error_log` row through `logApiRequest` before the limiter runs. If
  that ever matters, it belongs in nginx (`limit_req`), as a complement to this.

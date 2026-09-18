import { ApiError } from '@/lib/api-error';
import { env } from '@/lib/env';
import { logError } from '@/lib/error-log';

// Per-IP rate limit for the public ingest endpoints (`POST /api/registros`,
// `/api/encuestas`, `/api/grupos`) — see docs/adr/0017-ingest-rate-limiting.md.
//
// Those endpoints have no authentication: `assertPublicIngestOrigin` is a CORS
// allowlist that stops a hostile web page, not a script. On 2026-09-18 a single
// IP wrote 240 registros into project 11 over four hours.
//
// WHY THIS IS OPT-IN PER PROJECT. Traffic here is of two incompatible kinds:
// projects 1/2/4 receive ~160.000 rows server-to-server from four fixed
// WordPress IPs (one of them sent 144.942 on its own), while project 11 is
// browser traffic from ~2.700 distinct IPs at ~1,14 rows each. A limit that
// applied to everything would take the launch funnel offline, so only the
// projects listed in INGEST_RATE_LIMIT_PROJECTS are policed and the
// server-to-server ones are out of reach by construction — no hosting IP change
// can ever break them.
//
// Server-only, and deliberately free of any `db` import: this runs on the hot
// path of every ingest request.

type Decision = {
  limited: boolean;
  ip: string;
  count: number;
  retryAfterSeconds: number;
};

const MODE = env.INGEST_RATE_LIMIT_MODE;
const MAX = env.INGEST_RATE_LIMIT_MAX;
const WINDOW_MS = env.INGEST_RATE_LIMIT_WINDOW_MS;
const POLICED_PROJECTS = parseProjects(env.INGEST_RATE_LIMIT_PROJECTS);
const EXEMPT_IPS = parseIps(env.INGEST_RATE_LIMIT_EXEMPT_IPS);

// Memory guard, not an operator knob. At ~2.700 distinct IPs/hour the map sits
// far below this; the cap only matters under a distributed flood.
const MAX_KEYS = 20_000;
const NOTICE_INTERVAL_MS = 3_600_000;

// key -> hit timestamps inside the current window, oldest first, length <= MAX.
const hits = new Map<string, number[]>();
let lastSweep = Date.now();
const lastNotice = new Map<string, number>();

function parseProjects(raw: string): Set<number> {
  const ids = raw
    .split(',')
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  return new Set(ids);
}

function parseIps(raw: string): Set<string> {
  const ips = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return new Set(ips);
}

// True at most once per `NOTICE_INTERVAL_MS` for a given key, so a flood cannot
// turn into one `error_log` row per request.
function shouldNotice(key: string, now: number) {
  const previous = lastNotice.get(key);
  if (previous !== undefined && now - previous < NOTICE_INTERVAL_MS) return false;
  lastNotice.set(key, now);
  return true;
}

// nginx sets `X-Real-IP $remote_addr`, which OVERWRITES whatever the client
// sent, and `X-Forwarded-For $proxy_add_x_forwarded_for`, which APPENDS to it.
// So the first value of `x-forwarded-for` is attacker-controlled — the idiom in
// `audit.ts` reads it for display, but keying a limit on it would let anyone
// rotate a header and get a fresh budget per request. Read `x-real-ip`, and fall
// back to the LAST segment of `x-forwarded-for` (the hop nginx appended).
export function readClientIp(request: Request): string | null {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp.length <= 45 ? realIp : null;

  const forwarded = request.headers.get('x-forwarded-for');
  if (!forwarded) return null;
  const segments = forwarded.split(',');
  const last = segments[segments.length - 1]?.trim();
  if (!last) return null;
  return last.length <= 45 ? last : null;
}

// Amortized cleanup, on the request path rather than in `src/server/cron.ts`:
// that cron is started by the Nitro plugin, so a cron-based sweep would behave
// differently under `pnpm dev` than in production.
function sweep(now: number) {
  if (now - lastSweep < WINDOW_MS && hits.size <= MAX_KEYS) return;
  lastSweep = now;

  for (const [key, timestamps] of hits) {
    const newest = timestamps[timestamps.length - 1];
    if (newest === undefined || now - newest > WINDOW_MS) hits.delete(key);
  }
  for (const [key, at] of lastNotice) {
    if (now - at > NOTICE_INTERVAL_MS) lastNotice.delete(key);
  }

  // Still above the cap after sweeping: a distributed flood. Fail open rather
  // than grow without a ceiling.
  if (hits.size > MAX_KEYS) {
    hits.clear();
    if (shouldNotice('sweep-overflow', now)) {
      void logError({
        level: 'warn',
        message: `rate-limit: más de ${MAX_KEYS} claves activas, contadores reiniciados`,
        source: 'ingest-rate-limit',
        metadata: { maxKeys: MAX_KEYS, windowMs: WINDOW_MS },
      });
    }
  }
}

function evaluate(ip: string, proyectoId: number, now: number): Decision {
  const key = `${ip}|${proyectoId}`;
  const previous = hits.get(key) ?? [];
  const live = previous.filter((at) => now - at < WINDOW_MS);

  if (live.length >= MAX) {
    hits.set(key, live);
    const oldest = live[0] ?? now;
    return {
      limited: true,
      ip,
      count: live.length,
      retryAfterSeconds: Math.max(1, Math.ceil((oldest + WINDOW_MS - now) / 1000)),
    };
  }

  live.push(now);
  hits.set(key, live);
  return { limited: false, ip, count: live.length, retryAfterSeconds: 0 };
}

// Throws ApiError(429) when the caller is over the limit and the mode is
// 'enforce'. In 'shadow' the bookkeeping and the logging are identical but
// nothing is blocked — that is how a threshold gets validated against real
// traffic before it can cost a lead.
//
// Counts ATTEMPTS, not successes: it runs before the field validation and before
// any database work, so a garbage body consumes budget too. That is also what
// makes manual verification safe, since a body that fails validation is counted
// and then rejected without writing a row.
export async function assertIngestRateLimit(request: Request, proyectoId: number, action: string) {
  if (MODE === 'off') return;
  if (!POLICED_PROJECTS.has(proyectoId)) return;

  const now = Date.now();
  sweep(now);

  const ip = readClientIp(request);
  if (!ip) {
    // In production nginx always sets the header; a request without one is a
    // local caller (curl, healthcheck). Failing closed here would break local
    // verification and would take ingest down the day someone edits the nginx
    // block, so this fails open and says so.
    if (shouldNotice('missing-ip', now)) {
      await logError({
        level: 'warn',
        message: 'rate-limit: solicitud de ingesta sin IP legible, no se aplicó el límite',
        source: 'ingest-rate-limit',
        metadata: { action, proyectoId },
      });
    }
    return;
  }

  if (EXEMPT_IPS.has(ip)) return;

  const decision = evaluate(ip, proyectoId, now);
  if (!decision.limited) return;

  // One row per key per window. Without this dedup an abuser at 4 requests/min
  // adds 240 `error_log` rows an hour on top of the two each request already
  // writes.
  if (shouldNotice(`hit|${ip}|${proyectoId}`, now)) {
    await logError({
      level: MODE === 'enforce' ? 'error' : 'warn',
      message: `rate-limit ${MODE}: ${ip} superó ${MAX} solicitudes en el proyecto ${proyectoId}`,
      source: 'ingest-rate-limit',
      metadata: {
        mode: MODE,
        ip,
        proyectoId,
        action,
        count: decision.count,
        max: MAX,
        windowMs: WINDOW_MS,
        userAgent: request.headers.get('user-agent')?.slice(0, 255) ?? null,
        origin: request.headers.get('origin') ?? null,
      },
    });
  }

  if (MODE !== 'enforce') return;

  // The message names neither the limit nor the IP: that belongs in error_log,
  // not in the hands of whoever is hitting the endpoint.
  throw new ApiError(
    'Demasiadas solicitudes desde esta conexión. Espera unos minutos y vuelve a intentarlo.',
    429,
    { 'retry-after': String(decision.retryAfterSeconds) },
  );
}

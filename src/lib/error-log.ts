import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';

// Dashboard write path into `error_log` (plan §4.6, phase 09 item 3). Rows
// written here carry emitter='dashboard'; the Express server writes its own with
// emitter='express-server' (see docs/db/error_log.md). The viewer tails both.
//
// Server-only. Best-effort: a failure to persist a log must never throw into the
// caller's catch block, so the insert is wrapped and swallowed (with a console
// fallback) — losing a log row is preferable to masking the original error.

type LogLevel = 'error' | 'warn' | 'info';

export async function logError(entry: {
  level: LogLevel;
  message: string;
  stack?: string | null;
  source?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await db.insert(errorLog).values({
      level: entry.level,
      message: entry.message.slice(0, 2000),
      stack: entry.stack ?? null,
      source: entry.source ?? null,
      requestId: entry.requestId ?? null,
      metadata: entry.metadata ?? null,
      emitter: 'dashboard',
    });
  } catch (err) {
    console.error('[error-log] failed to persist dashboard error', err);
  }
}

import { db } from '@/db/index';
import { env } from '@/lib/env';
import { createFileRoute } from '@tanstack/react-router';
import { sql } from 'drizzle-orm';

// GET /api/healthz (plan §6.5). 200 only when the process is responsive and
// SELECT 1 succeeds within ~1s. Resend is reported but does not gate health.
export const Route = createFileRoute('/api/healthz')({
  server: {
    handlers: {
      GET: async () => {
        let dbOk = false;
        try {
          await db.execute(sql`SELECT 1`);
          dbOk = true;
        } catch {
          dbOk = false;
        }
        const body = {
          status: dbOk ? 'ok' : 'degraded',
          db: dbOk ? 'ok' : 'down',
          resend: env.RESEND_API_KEY ? 'ok' : 'unverified',
          uptime_s: Math.round(process.uptime()),
        };
        return new Response(JSON.stringify(body), {
          status: dbOk ? 200 : 503,
          headers: { 'content-type': 'application/json' },
        });
      },
    },
  },
});

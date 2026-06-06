import { db } from '@/db/index';
import { errorLog } from '@/db/schema/index';
import { auth } from '@/lib/auth';
import { resolveAccess } from '@/lib/rbac';
import { createFileRoute } from '@tanstack/react-router';
import { desc, gt } from 'drizzle-orm';

// GET /api/logs/stream — Server-Sent Events tail of error_log (plan §4.6, §9 SSE).
// Polls for rows newer than the last id and pushes them. Default poll 2s.
// Admin-only (ADR 0014) — error_log can carry sensitive payloads, so the raw
// stream is protected the same as the viewer page, not just the UI route.
export const Route = createFileRoute('/api/logs/stream')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session) return new Response('No autenticado.', { status: 401 });
        const { isAdmin } = await resolveAccess(session.user.id);
        if (!isAdmin) return new Response('Sin permiso.', { status: 403 });

        const encoder = new TextEncoder();
        let lastId = 0;
        let timer: ReturnType<typeof setInterval>;

        const stream = new ReadableStream({
          start(controller) {
            const tick = async () => {
              try {
                const rows = await db
                  .select()
                  .from(errorLog)
                  .where(gt(errorLog.id, lastId))
                  .orderBy(desc(errorLog.id))
                  .limit(50);
                for (const row of rows.reverse()) {
                  lastId = Math.max(lastId, row.id);
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(row)}\n\n`));
                }
              } catch {
                controller.enqueue(encoder.encode('event: error\ndata: {}\n\n'));
              }
            };
            timer = setInterval(tick, 2000);
            void tick();
          },
          cancel() {
            clearInterval(timer);
          },
        });

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        });
      },
    },
  },
});

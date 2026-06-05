import { AppShell } from '@/components/AppShell';
import { Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { es } from '@/i18n/es';
import { fetchRecentLogs } from '@/lib/logs-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

export const Route = createFileRoute('/logs/')({
  beforeLoad: ({ context }) => requirePermission(context, 'logs:read'),
  loader: () => fetchRecentLogs(),
  component: LogsPage,
});

type Data = Awaited<ReturnType<typeof fetchRecentLogs>>;
type LogRow = Data['logs'][number];

const LEVEL_VARIANT: Record<string, 'danger' | 'warning' | 'info' | 'idle'> = {
  error: 'danger',
  fatal: 'danger',
  warn: 'warning',
  warning: 'warning',
  info: 'info',
};

const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const selectClass =
  'h-9 border border-hair-2 bg-bg-1 px-2 text-[13px] text-fg-1 outline-none focus-visible:border-brand';

function LogsPage() {
  const initial = Route.useLoaderData().logs;

  const [rows, setRows] = useState<LogRow[]>(initial);
  const [live, setLive] = useState(true);
  const [connLost, setConnLost] = useState(false);
  const [level, setLevel] = useState('all');
  const [emitter, setEmitter] = useState('all');
  const [text, setText] = useState('');

  // Dedup across the loader's seed and the stream's initial burst (the SSE
  // starts from id 0). Buffer rows while paused so none are lost on resume.
  const seen = useRef<Set<number>>(new Set(initial.map((r) => r.id)));
  const buffer = useRef<LogRow[]>([]);
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const source = new EventSource('/api/logs/stream');
    source.onmessage = (e) => {
      try {
        const row = JSON.parse(e.data) as LogRow;
        if (!row || typeof row.id !== 'number' || seen.current.has(row.id)) return;
        seen.current.add(row.id);
        if (liveRef.current) setRows((prev) => [...prev, row]);
        else buffer.current.push(row);
        setConnLost(false);
      } catch {
        // Ignore non-JSON keep-alive / error frames.
      }
    };
    source.onerror = () => setConnLost(true);
    return () => source.close();
  }, []);

  function toggleLive() {
    setLive((v) => {
      const next = !v;
      if (next && buffer.current.length) {
        setRows((prev) => [...prev, ...buffer.current]);
        buffer.current = [];
      }
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (level === 'all' || r.level === level) &&
        (emitter === 'all' || r.emitter === emitter) &&
        (!q || r.message.toLowerCase().includes(q)),
    );
    // Newest first.
    return out.reverse();
  }, [rows, level, emitter, text]);

  return (
    <AppShell crumbs={[es.app.name, es.nav.logs]}>
      <h1 className="h1">{es.logs.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.logs.subtitle}</p>

      <div className="mt-7 flex flex-wrap items-center gap-3">
        <Input
          className="max-w-xs"
          placeholder={es.logs.filterText}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <select
          aria-label={es.logs.filterLevel}
          className={selectClass}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          <option value="all">
            {es.logs.filterLevel}: {es.logs.all}
          </option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
        </select>
        <select
          aria-label={es.logs.filterEmitter}
          className={selectClass}
          value={emitter}
          onChange={(e) => setEmitter(e.target.value)}
        >
          <option value="all">
            {es.logs.filterEmitter}: {es.logs.all}
          </option>
          <option value="dashboard">{es.logs.emitter.dashboard}</option>
          <option value="express-server">{es.logs.emitter['express-server']}</option>
        </select>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[12px] text-fg-3">
            <span
              className={`size-1.5 rounded-full ${live && !connLost ? 'bg-success' : 'bg-fg-4'}`}
            />
            {connLost ? es.logs.connectionLost : live ? es.logs.live : es.logs.paused}
          </span>
          <Button variant="default" size="sm" onClick={toggleLive}>
            {live ? es.logs.pause : es.logs.resume}
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Table
          columns={[
            {
              key: 'time',
              header: es.logs.colTime,
              sortValue: (r) => new Date(r.createdAt).getTime(),
              render: (r) => (
                <span className="whitespace-nowrap text-fg-3">{fmtTime(r.createdAt)}</span>
              ),
            },
            {
              key: 'level',
              header: es.logs.colLevel,
              sortValue: (r) => r.level,
              render: (r) => <Badge variant={LEVEL_VARIANT[r.level] ?? 'idle'}>{r.level}</Badge>,
            },
            {
              key: 'emitter',
              header: es.logs.colEmitter,
              sortValue: (r) => r.emitter,
              render: (r) => (
                <span className="text-fg-2">
                  {es.logs.emitter[r.emitter as keyof typeof es.logs.emitter] ?? r.emitter}
                </span>
              ),
            },
            {
              key: 'source',
              header: es.logs.colSource,
              sortValue: (r) => r.source ?? '',
              render: (r) => <span className="text-fg-3">{r.source ?? '—'}</span>,
            },
            {
              key: 'message',
              header: es.logs.colMessage,
              sortValue: (r) => r.message,
              render: (r) => <span className="text-fg-1">{r.message}</span>,
            },
          ]}
          rows={filtered}
          getRowKey={(r) => String(r.id)}
          empty={rows.length === 0 ? es.logs.empty : es.logs.noResults}
        />
      </div>
    </AppShell>
  );
}

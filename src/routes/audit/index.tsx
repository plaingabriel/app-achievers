import { AppShell } from '@/components/AppShell';
import { Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { es } from '@/i18n/es';
import { fetchAuditData } from '@/lib/audit-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/audit/')({
  // Any role with audit:read reaches this; the server decides own-vs-all rows
  // (audit:read_all). Append-only — there is no write/edit/delete path.
  beforeLoad: ({ context }) => requirePermission(context, 'audit:read'),
  loader: () => fetchAuditData(),
  component: AuditPage,
});

type Data = Awaited<ReturnType<typeof fetchAuditData>>;
type AuditRow = Data['rows'][number];

// Failures stand out; auth/session events read as info; the rest stay neutral.
const ACTION_VARIANT: Record<string, 'danger' | 'success' | 'warning' | 'info' | 'idle'> = {
  'login.failure': 'danger',
  'login.success': 'success',
  'session.revoked': 'idle',
  'twofactor.enabled': 'success',
  'twofactor.disabled': 'warning',
};

const actionLabel = (a: string) => es.audit.action[a as keyof typeof es.audit.action] ?? a;

const fmtTime = (d: Date | string) =>
  new Date(d).toLocaleString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

function AuditPage() {
  const { rows, seeAll } = Route.useLoaderData();
  const [text, setText] = useState('');

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.actorEmail?.toLowerCase().includes(q) ||
        r.action.toLowerCase().includes(q) ||
        actionLabel(r.action).toLowerCase().includes(q) ||
        r.targetId?.toLowerCase().includes(q),
    );
  }, [rows, text]);

  return (
    <AppShell crumbs={[es.app.name, es.nav.audit]}>
      <h1 className="h1">{es.audit.title}</h1>
      <p className="body-sm mt-2 text-fg-3">
        {seeAll ? es.audit.subtitleAll : es.audit.subtitleOwn}
      </p>

      <div className="mt-7 flex items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder={es.audit.filterText}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <span className="text-[12px] text-fg-3">
          {filtered.length} {es.common.records}
        </span>
      </div>

      <div className="mt-3">
        <Table<AuditRow>
          columns={[
            {
              key: 'time',
              header: es.audit.colTime,
              sortValue: (r) => new Date(r.createdAt).getTime(),
              render: (r) => (
                <span className="whitespace-nowrap text-fg-3">{fmtTime(r.createdAt)}</span>
              ),
            },
            {
              key: 'actor',
              header: es.audit.colActor,
              sortValue: (r) => r.actorEmail ?? '',
              render: (r) => <span className="text-fg-1">{r.actorEmail ?? es.audit.system}</span>,
            },
            {
              key: 'action',
              header: es.audit.colAction,
              sortValue: (r) => actionLabel(r.action),
              render: (r) => (
                <Badge variant={ACTION_VARIANT[r.action] ?? 'idle'}>{actionLabel(r.action)}</Badge>
              ),
            },
            {
              key: 'target',
              header: es.audit.colTarget,
              sortValue: (r) => `${r.targetType}${r.targetId ? `: ${r.targetId}` : ''}`,
              render: (r) => (
                <span className="text-fg-3">
                  {r.targetType}
                  {r.targetId ? `: ${r.targetId}` : ''}
                </span>
              ),
            },
            ...(seeAll
              ? [
                  {
                    key: 'ip',
                    header: es.audit.colIp,
                    sortValue: (r: AuditRow) => r.ip ?? '',
                    render: (r: AuditRow) => <span className="text-fg-3">{r.ip ?? '—'}</span>,
                  },
                ]
              : []),
          ]}
          rows={filtered}
          getRowKey={(r) => r.id}
          empty={rows.length === 0 ? es.audit.empty : es.audit.noResults}
        />
      </div>
    </AppShell>
  );
}

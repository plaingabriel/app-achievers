import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import {
  createCalendario,
  deleteCalendario,
  fetchCalendariosData,
  updateCalendario,
} from '@/lib/calendarios-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/calendarios/')({
  beforeLoad: ({ context }) => requirePermission(context, 'calendarios:read'),
  loader: () => fetchCalendariosData(),
  component: CalendariosPage,
});

type Data = Awaited<ReturnType<typeof fetchCalendariosData>>;
type Calendario = Data['calendarios'][number];

const TEXT_FIELDS = [
  { key: 'formId', label: es.calendarios.fieldFormId },
  { key: 'landingId', label: es.calendarios.fieldLandingId },
  { key: 'funnel', label: es.calendarios.fieldFunnel },
] as const;

function CalendariosPage() {
  const data = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canWrite = permissions.includes('calendarios:write');
  const canDelete = permissions.includes('calendarios:delete');

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ row: Calendario; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Calendario | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.calendarios;
    return data.calendarios.filter((c) =>
      [c.pkNombre, c.funnel].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [data.calendarios, query]);

  const blank: Calendario = {
    pkNombre: '',
    formId: '',
    landingId: '',
    funnel: '',
    setter: false,
    activo: true,
  };

  return (
    <AppShell crumbs={[es.app.name, es.nav.calendarios]}>
      <h1 className="h1">{es.calendarios.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.calendarios.subtitle}</p>

      <div className="mt-7 flex items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder={es.common.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-fg-3">
            {rows.length} {es.common.records}
          </span>
          {canWrite && (
            <Button variant="primary" onClick={() => setEditing({ row: blank, isNew: true })}>
              {es.calendarios.add}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Table
          columns={[
            {
              key: 'name',
              header: es.calendarios.colName,
              render: (c) => <span className="text-fg-1">{c.pkNombre}</span>,
            },
            {
              key: 'funnel',
              header: es.calendarios.colFunnel,
              render: (c) => <span className="text-fg-2">{c.funnel ?? '—'}</span>,
            },
            {
              key: 'setter',
              header: es.calendarios.colSetter,
              render: (c) => (
                <Badge variant={c.setter ? 'info' : 'idle'}>
                  {c.setter ? es.common.yes : es.common.no}
                </Badge>
              ),
            },
            {
              key: 'active',
              header: es.calendarios.colActive,
              render: (c) => (
                <Badge variant={c.activo ? 'success' : 'idle'}>
                  {c.activo ? es.common.active : es.common.inactive}
                </Badge>
              ),
            },
          ]}
          rows={rows}
          getRowKey={(c) => c.pkNombre}
          empty={query ? es.data.noResults : es.calendarios.empty}
          actions={
            canWrite || canDelete
              ? (c) => (
                  <div className="flex justify-end gap-1">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ row: c, isNew: false })}
                      >
                        {es.common.edit}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-bg hover:text-danger"
                        onClick={() => setDeleting(c)}
                      >
                        {es.common.delete}
                      </Button>
                    )}
                  </div>
                )
              : undefined
          }
        />
      </div>

      {editing && (
        <CalendarioForm row={editing.row} isNew={editing.isNew} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteCalendario calendario={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function CalendarioForm({
  row,
  isNew,
  onClose,
}: {
  row: Calendario;
  isNew: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pkNombre, setPkNombre] = useState(row.pkNombre);
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, row[f.key] ?? ''])),
  );
  const [setter, setSetter] = useState<boolean>(row.setter ?? false);
  const [activo, setActivo] = useState<boolean>(row.activo ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string) => setText((prev) => ({ ...prev, [key]: value }));

  async function onSubmit() {
    setError('');
    setBusy(true);
    try {
      const fields = {
        formId: text.formId ?? '',
        landingId: text.landingId ?? '',
        funnel: text.funnel ?? '',
        setter,
        activo,
      };
      const res = isNew
        ? await createCalendario({ data: { pkNombre, ...fields } })
        : await updateCalendario({ data: { pkNombre: row.pkNombre, ...fields } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[calendarios] save failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? es.calendarios.newTitle : es.calendarios.editTitle} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="cal-name">{es.calendarios.fieldName}</Label>
          <Input
            id="cal-name"
            value={pkNombre}
            disabled={!isNew}
            onChange={(e) => setPkNombre(e.target.value)}
          />
          {isNew && <p className="mt-1.5 text-[11px] text-fg-3">{es.calendarios.nameHint}</p>}
        </div>
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`cal-${f.key}`}>{f.label}</Label>
            <Input
              id={`cal-${f.key}`}
              value={text[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
        <div className="flex items-center gap-6">
          <label htmlFor="cal-setter" className="flex items-center gap-2 text-[13px] text-fg-1">
            <Checkbox
              id="cal-setter"
              checked={setter}
              onChange={(e) => setSetter(e.target.checked)}
            />
            {es.calendarios.fieldSetter}
          </label>
          <label htmlFor="cal-activo" className="flex items-center gap-2 text-[13px] text-fg-1">
            <Checkbox
              id="cal-activo"
              checked={activo}
              onChange={(e) => setActivo(e.target.checked)}
            />
            {es.calendarios.fieldActive}
          </label>
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
            {es.common.cancel}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={onSubmit}>
            {busy ? es.common.saving : isNew ? es.data.create : es.common.save}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function DeleteCalendario({
  calendario,
  onClose,
}: {
  calendario: Calendario;
  onClose: () => void;
}) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setError('');
    setBusy(true);
    try {
      const res = await deleteCalendario({ data: { pkNombre: calendario.pkNombre } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[calendarios] delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.data.deleteTitle}
      body={`${es.data.deleteBody} (${calendario.pkNombre})`}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

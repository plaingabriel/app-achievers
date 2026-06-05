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
import { createCloser, deleteCloser, fetchClosersData, updateCloser } from '@/lib/closers-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/closers/')({
  beforeLoad: ({ context }) => requirePermission(context, 'closers:read'),
  loader: () => fetchClosersData(),
  component: ClosersPage,
});

type Data = Awaited<ReturnType<typeof fetchClosersData>>;
type Closer = Data['closers'][number];

// Text (non-key, non-boolean) fields, in form display order.
const TEXT_FIELDS = [
  { key: 'nombre', label: es.closers.fieldName },
  { key: 'apellido', label: es.closers.fieldSurname },
  { key: 'tagNotion', label: es.closers.fieldTagNotion },
  { key: 'idNotion', label: es.closers.fieldIdNotion },
  { key: 'formId', label: es.closers.fieldFormId },
  { key: 'landingId', label: es.closers.fieldLandingId },
  { key: 'avatarUrl', label: es.closers.fieldAvatarUrl },
  { key: 'funnel', label: es.closers.fieldFunnel },
  { key: 'calendlyUser', label: es.closers.fieldCalendlyUser },
] as const;

function ClosersPage() {
  const data = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canWrite = permissions.includes('closers:write');
  const canDelete = permissions.includes('closers:delete');

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ row: Closer; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Closer | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.closers;
    return data.closers.filter((c) =>
      [c.pkEmail, c.nombre, c.apellido, c.funnel].some((v) => v?.toLowerCase().includes(q)),
    );
  }, [data.closers, query]);

  const blank: Closer = {
    pkEmail: '',
    nombre: '',
    apellido: '',
    tagNotion: '',
    idNotion: '',
    formId: '',
    landingId: '',
    avatarUrl: '',
    funnel: '',
    calendlyUser: '',
    activo: true,
  };

  return (
    <AppShell crumbs={[es.app.name, es.nav.closers]}>
      <h1 className="h1">{es.closers.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.closers.subtitle}</p>

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
              {es.closers.add}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Table
          columns={[
            {
              key: 'email',
              header: es.closers.colEmail,
              render: (c) => <span className="text-fg-1">{c.pkEmail}</span>,
            },
            {
              key: 'name',
              header: es.closers.colName,
              render: (c) => <span className="text-fg-2">{c.nombre ?? '—'}</span>,
            },
            {
              key: 'surname',
              header: es.closers.colSurname,
              render: (c) => <span className="text-fg-2">{c.apellido ?? '—'}</span>,
            },
            {
              key: 'funnel',
              header: es.closers.colFunnel,
              render: (c) => <span className="text-fg-3">{c.funnel ?? '—'}</span>,
            },
            {
              key: 'active',
              header: es.closers.colActive,
              render: (c) => (
                <Badge variant={c.activo ? 'success' : 'idle'}>
                  {c.activo ? es.common.active : es.common.inactive}
                </Badge>
              ),
            },
          ]}
          rows={rows}
          getRowKey={(c) => c.pkEmail}
          empty={query ? es.data.noResults : es.closers.empty}
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
        <CloserForm row={editing.row} isNew={editing.isNew} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeleteCloser closer={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function CloserForm({ row, isNew, onClose }: { row: Closer; isNew: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pkEmail, setPkEmail] = useState(row.pkEmail);
  const [text, setText] = useState<Record<string, string>>(() =>
    Object.fromEntries(TEXT_FIELDS.map((f) => [f.key, row[f.key] ?? ''])),
  );
  const [activo, setActivo] = useState<boolean>(row.activo ?? true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (key: string, value: string) => setText((prev) => ({ ...prev, [key]: value }));

  async function onSubmit() {
    setError('');
    setBusy(true);
    try {
      const fields = {
        nombre: text.nombre ?? '',
        apellido: text.apellido ?? '',
        tagNotion: text.tagNotion ?? '',
        idNotion: text.idNotion ?? '',
        formId: text.formId ?? '',
        landingId: text.landingId ?? '',
        avatarUrl: text.avatarUrl ?? '',
        funnel: text.funnel ?? '',
        calendlyUser: text.calendlyUser ?? '',
        activo,
      };
      const res = isNew
        ? await createCloser({ data: { pkEmail, ...fields } })
        : await updateCloser({ data: { pkEmail: row.pkEmail, ...fields } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[closers] save failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? es.closers.newTitle : es.closers.editTitle} onClose={onClose}>
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <Label htmlFor="closer-email">{es.closers.fieldEmail}</Label>
          <Input
            id="closer-email"
            type="email"
            value={pkEmail}
            disabled={!isNew}
            onChange={(e) => setPkEmail(e.target.value)}
          />
          {isNew && <p className="mt-1.5 text-[11px] text-fg-3">{es.closers.emailHint}</p>}
        </div>
        {TEXT_FIELDS.map((f) => (
          <div key={f.key}>
            <Label htmlFor={`closer-${f.key}`}>{f.label}</Label>
            <Input
              id={`closer-${f.key}`}
              value={text[f.key]}
              onChange={(e) => set(f.key, e.target.value)}
            />
          </div>
        ))}
        <label htmlFor="closer-activo" className="flex items-center gap-2 text-[13px] text-fg-1">
          <Checkbox
            id="closer-activo"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
          />
          {es.closers.fieldActive}
        </label>
        {error && <p className="text-[12px] text-danger">{error}</p>}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
          {es.common.cancel}
        </Button>
        <Button variant="primary" size="sm" disabled={busy} onClick={onSubmit}>
          {busy ? es.common.saving : isNew ? es.data.create : es.common.save}
        </Button>
      </div>
    </Modal>
  );
}

function DeleteCloser({ closer, onClose }: { closer: Closer; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setError('');
    setBusy(true);
    try {
      const res = await deleteCloser({ data: { pkEmail: closer.pkEmail } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[closers] delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.data.deleteTitle}
      body={`${es.data.deleteBody} (${closer.pkEmail})`}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

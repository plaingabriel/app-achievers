import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { Table } from '@/components/Table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import {
  createPersona,
  deletePersona,
  fetchPersonasData,
  updatePersona,
} from '@/lib/personas-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/personas/')({
  // Data CRUD on the frozen Personas table. Mutations re-check personas:write /
  // personas:delete server-side; delete is admin-only via the seeded matrix.
  beforeLoad: ({ context }) => requirePermission(context, 'personas:read'),
  loader: () => fetchPersonasData(),
  component: PersonasPage,
});

type Data = Awaited<ReturnType<typeof fetchPersonasData>>;
type Persona = Data['personas'][number];

function PersonasPage() {
  const data = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canWrite = permissions.includes('personas:write');
  const canDelete = permissions.includes('personas:delete');

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ row: Persona; isNew: boolean } | null>(null);
  const [deleting, setDeleting] = useState<Persona | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.personas;
    return data.personas.filter(
      (p) => p.id.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
    );
  }, [data.personas, query]);

  return (
    <AppShell crumbs={[es.app.name, es.nav.personas]}>
      <h1 className="h1">{es.personas.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.personas.subtitle}</p>

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
            <Button
              variant="primary"
              onClick={() => setEditing({ row: { id: '', name: '' }, isNew: true })}
            >
              {es.personas.add}
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3">
        <Table
          columns={[
            {
              key: 'id',
              header: es.personas.colId,
              render: (p) => <span className="text-fg-2">{p.id}</span>,
            },
            {
              key: 'name',
              header: es.personas.colName,
              render: (p) => <span className="text-fg-1">{p.name}</span>,
            },
          ]}
          rows={rows}
          getRowKey={(p) => p.id}
          empty={query ? es.data.noResults : es.personas.empty}
          actions={
            canWrite || canDelete
              ? (p) => (
                  <div className="flex justify-end gap-1">
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ row: p, isNew: false })}
                      >
                        {es.common.edit}
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-danger hover:bg-danger-bg hover:text-danger"
                        onClick={() => setDeleting(p)}
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
        <PersonaForm row={editing.row} isNew={editing.isNew} onClose={() => setEditing(null)} />
      )}
      {deleting && <DeletePersona persona={deleting} onClose={() => setDeleting(null)} />}
    </AppShell>
  );
}

function PersonaForm({
  row,
  isNew,
  onClose,
}: { row: Persona; isNew: boolean; onClose: () => void }) {
  const router = useRouter();
  const [id, setId] = useState(row.id);
  const [name, setName] = useState(row.name);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError('');
    setBusy(true);
    try {
      const res = isNew
        ? await createPersona({ data: { id, name } })
        : await updatePersona({ data: { id: row.id, name } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[personas] save failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? es.personas.newTitle : es.personas.editTitle} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="persona-id">{es.personas.colId}</Label>
          <Input
            id="persona-id"
            value={id}
            disabled={!isNew}
            onChange={(e) => setId(e.target.value)}
          />
          {isNew && <p className="mt-1.5 text-[11px] text-fg-3">{es.personas.idHint}</p>}
        </div>
        <div>
          <Label htmlFor="persona-name">{es.personas.colName}</Label>
          <Input id="persona-name" value={name} onChange={(e) => setName(e.target.value)} />
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

function DeletePersona({ persona, onClose }: { persona: Persona; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onConfirm() {
    setError('');
    setBusy(true);
    try {
      const res = await deletePersona({ data: { id: persona.id } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[personas] delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.data.deleteTitle}
      body={`${es.data.deleteBody} (${persona.name})`}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

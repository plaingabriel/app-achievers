import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { type Column, Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import {
  createProjectEntry,
  deleteProjectEntry,
  fetchProjectDetail,
  fetchProjectsOverview,
  updateProjectEntry,
} from '@/lib/projects-dashboard-server';
import { requireAdmin } from '@/lib/route-guards';
import { cn } from '@/lib/utils';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

export const Route = createFileRoute('/proyectos/')({
  beforeLoad: ({ context }) => requireAdmin(context),
  loader: () => fetchProjectsOverview(),
  component: ProjectsPage,
});

type OverviewData = Awaited<ReturnType<typeof fetchProjectsOverview>>;
type ProjectSummary = OverviewData['projects'][number];
type ProjectDetail = Awaited<ReturnType<typeof fetchProjectDetail>>;
type RegistroRow = ProjectDetail['registros'][number];

const BASE_COLUMN_KEYS = ['createdAt', 'nombre', 'correo', 'telefono', 'origen'] as const;
const SELECT_CLASS_NAME =
  'h-9 w-full rounded-none border border-hair-2 bg-bg-1 px-3 font-mono text-[13px] text-fg-1 outline-none transition-colors duration-140 ease-achievers focus-visible:border-brand focus-visible:shadow-[0_0_0_2px_rgba(245,158,11,0.18)]';

function ProjectsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  const [projectQuery, setProjectQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    data.projects[0]?.id ?? null,
  );
  const [editing, setEditing] = useState<{ project: ProjectSummary | null } | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [recordsQuery, setRecordsQuery] = useState('');
  const [origenFilter, setOrigenFilter] = useState('');
  const [detail, setDetail] = useState<{
    loading: boolean;
    error: string;
    data: ProjectDetail | null;
  }>({ loading: false, error: '', data: null });
  const [visibleMetadataKeys, setVisibleMetadataKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!data.projects.length) {
      setSelectedProjectId(null);
      return;
    }

    const stillExists = data.projects.some((project) => project.id === selectedProjectId);
    if (!stillExists) setSelectedProjectId(data.projects[0]?.id ?? null);
  }, [data.projects, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail(projectId: number) {
      setDetail((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const projectDetail = await fetchProjectDetail({ data: { projectId } });
        if (cancelled) return;
        setDetail({ loading: false, error: '', data: projectDetail });
      } catch (err) {
        console.error('[projects] detail load failed', err);
        if (cancelled) return;
        setDetail({ loading: false, error: es.errors.generic, data: null });
      }
    }

    if (selectedProjectId === null) {
      setDetail({ loading: false, error: '', data: null });
      return () => {
        cancelled = true;
      };
    }

    void loadDetail(selectedProjectId);

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId === undefined) return;
    setRecordsQuery('');
    setOrigenFilter('');
  }, [selectedProjectId]);

  const selectedProject = detail.data?.project ?? null;
  const registros = detail.data?.registros ?? [];

  const metadataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of registros) {
      if (!isPlainObject(row.metadata)) continue;
      for (const key of Object.keys(row.metadata)) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [registros]);

  useEffect(() => {
    if (!selectedProjectId) {
      setVisibleMetadataKeys([]);
      return;
    }

    const saved = readMetadataCookie(selectedProjectId);
    if (!saved) {
      setVisibleMetadataKeys(metadataKeys);
      return;
    }

    const visibleSet = new Set(saved);
    const merged = [
      ...saved.filter((key) => metadataKeys.includes(key)),
      ...metadataKeys.filter((key) => !visibleSet.has(key)),
    ];
    setVisibleMetadataKeys(merged);
  }, [selectedProjectId, metadataKeys]);

  useEffect(() => {
    if (!selectedProjectId) return;
    if (!detail.data || detail.data.project.id !== selectedProjectId) return;
    writeMetadataCookie(selectedProjectId, visibleMetadataKeys);
  }, [detail.data, selectedProjectId, visibleMetadataKeys]);

  const filteredProjects = useMemo(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return data.projects;
    return data.projects.filter((project) => project.nombre.toLowerCase().includes(q));
  }, [data.projects, projectQuery]);

  const filteredRegistros = useMemo(() => {
    const q = recordsQuery.trim().toLowerCase();
    return registros.filter((row) => {
      if (origenFilter && row.origen !== origenFilter) return false;
      if (!q) return true;

      const metadataText = isPlainObject(row.metadata)
        ? Object.values(row.metadata)
            .map((value) => formatMetadataValue(value).toLowerCase())
            .join(' ')
        : '';

      return [row.nombre, row.correo, row.telefono ?? '', row.origen, metadataText]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [recordsQuery, registros, origenFilter]);

  const origenes = useMemo(
    () =>
      Array.from(new Set(registros.map((row) => row.origen))).sort((a, b) => a.localeCompare(b)),
    [registros],
  );

  const metrics = useMemo(() => {
    const emails = new Set(registros.map((row) => row.correo.trim().toLowerCase()).filter(Boolean));
    const withPhone = registros.filter((row) => !!row.telefono?.trim()).length;
    const origins = new Set(registros.map((row) => row.origen));
    const originsCount = new Map<string, number>();

    for (const row of registros) {
      originsCount.set(row.origen, (originsCount.get(row.origen) ?? 0) + 1);
    }

    const topOrigins = Array.from(originsCount.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);

    return {
      total: registros.length,
      filtered: filteredRegistros.length,
      uniqueEmails: emails.size,
      withPhone,
      origins: origins.size,
      topOrigins,
    };
  }, [filteredRegistros.length, registros]);

  async function refreshOverview() {
    await router.invalidate();
  }

  async function handleProjectSaved(projectId: number) {
    await refreshOverview();
    setSelectedProjectId(projectId);
  }

  async function handleProjectDeleted(projectId: number) {
    await refreshOverview();
    if (selectedProjectId === projectId) {
      const next = data.projects.find((project) => project.id !== projectId)?.id ?? null;
      setSelectedProjectId(next);
    }
  }

  const registroColumns = useMemo<Column<RegistroRow>[]>(() => {
    const baseColumns: Column<RegistroRow>[] = [
      {
        key: 'createdAt',
        header: es.projects.createdCol,
        sortValue: (row) => row.createdAt.getTime(),
        render: (row) => <span className="text-fg-2">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'nombre',
        header: es.closers.fieldName,
        sortValue: (row) => row.nombre,
        render: (row) => <span className="text-fg-1">{row.nombre}</span>,
      },
      {
        key: 'correo',
        header: es.closers.fieldEmail,
        sortValue: (row) => row.correo,
        render: (row) => <span className="text-fg-2">{row.correo}</span>,
      },
      {
        key: 'telefono',
        header: 'Teléfono',
        sortValue: (row) => row.telefono ?? '',
        render: (row) => <span className="text-fg-2">{row.telefono ?? '—'}</span>,
      },
      {
        key: 'origen',
        header: 'Origen',
        sortValue: (row) => row.origen,
        render: (row) => (
          <Badge variant="info">
            <span className="size-1.5 rounded-full bg-current" />
            {row.origen}
          </Badge>
        ),
      },
    ];

    const visibleBase = baseColumns.filter((column) =>
      BASE_COLUMN_KEYS.includes(column.key as (typeof BASE_COLUMN_KEYS)[number]),
    );

    const metadataColumns: Column<RegistroRow>[] = visibleMetadataKeys.map((key) => ({
      key: `meta:${key}`,
      header: key,
      sortValue: (row) => {
        const value = isPlainObject(row.metadata) ? row.metadata[key] : undefined;
        return formatMetadataValue(value);
      },
      render: (row) => {
        const value = isPlainObject(row.metadata) ? row.metadata[key] : undefined;
        return <span className="text-fg-2">{formatMetadataValue(value) || '—'}</span>;
      },
    }));

    return [...visibleBase, ...metadataColumns];
  }, [visibleMetadataKeys]);

  return (
    <AppShell crumbs={[es.app.name, es.nav.projects]}>
      <div className="space-y-8">
        <section>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="h1">{es.projects.title}</h1>
              <p className="body-sm mt-2 max-w-3xl text-fg-3">{es.projects.subtitle}</p>
            </div>
            <Button variant="primary" onClick={() => setEditing({ project: null })}>
              {es.projects.add}
            </Button>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <Input
              className="max-w-xs"
              placeholder={es.projects.searchPlaceholder}
              value={projectQuery}
              onChange={(e) => setProjectQuery(e.target.value)}
            />
            <span className="text-[12px] text-fg-3">
              {filteredProjects.length} {es.common.records}
            </span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.length === 0 && (
              <div className="border border-hair-2 bg-bg-1 px-4 py-5 text-[12px] text-fg-3">
                {es.projects.empty}
              </div>
            )}
            {filteredProjects.map((project) => {
              const isActive = project.id === selectedProjectId;
              return (
                <div
                  key={project.id}
                  className={cn(
                    'border bg-bg-1 transition-colors duration-140 ease-achievers',
                    isActive ? 'border-brand bg-brand-bg/35' : 'border-hair-2 hover:border-hair-4',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedProjectId(project.id)}
                    className="w-full px-4 py-4 text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="label bracket-label">{es.nav.projects}</div>
                        <h2 className="mt-2 text-[18px] font-bold tracking-[-0.02em] text-fg-1">
                          {project.nombre}
                        </h2>
                      </div>
                      <Badge variant={isActive ? 'warning' : 'idle'}>
                        {project.registrosCount} {es.projects.recordsCol}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] text-fg-3">
                      <div>
                        <div className="label">{es.projects.createdCol}</div>
                        <div className="mt-1 text-fg-2">{formatDate(project.createdAt)}</div>
                      </div>
                      <div>
                        <div className="label">{es.projects.latestCol}</div>
                        <div className="mt-1 text-fg-2">
                          {project.latestRegistroAt
                            ? formatDateTime(project.latestRegistroAt)
                            : '—'}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-end gap-1 border-t border-hair-1 px-3 py-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing({ project })}>
                      {es.common.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger hover:bg-danger-bg hover:text-danger"
                      onClick={() => setDeleting(project)}
                    >
                      {es.common.delete}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border border-hair-2 bg-bg-1">
          {!selectedProject && !detail.loading && (
            <div className="px-5 py-7 text-[13px] text-fg-3">{es.projects.selectHint}</div>
          )}

          {detail.loading && (
            <div className="px-5 py-7 text-[13px] text-fg-3">{es.common.loading}</div>
          )}

          {detail.error && !detail.loading && (
            <div className="px-5 py-7 text-[13px] text-danger">{detail.error}</div>
          )}

          {selectedProject && !detail.loading && !detail.error && (
            <div className="space-y-6 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hair-1 pb-5">
                <div>
                  <div className="label bracket-label">{es.projects.metricsTitle}</div>
                  <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-fg-1">
                    {selectedProject.nombre}
                  </h2>
                  <p className="mt-2 max-w-2xl text-[12px] text-fg-3">{es.projects.recordsTitle}</p>
                </div>
                <Badge variant="warning">
                  {metrics.total} {es.projects.recordsCol}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard label={es.projects.recordsCol} value={metrics.total} />
                <MetricCard label={es.projects.filtered} value={metrics.filtered} />
                <MetricCard label={es.projects.uniqueEmails} value={metrics.uniqueEmails} />
                <MetricCard label={es.projects.phones} value={metrics.withPhone} />
                <MetricCard label={es.projects.origins} value={metrics.origins} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="label">{es.projects.topOrigins}</span>
                {metrics.topOrigins.length === 0 && (
                  <span className="text-[12px] text-fg-3">—</span>
                )}
                {metrics.topOrigins.map(([origin, total]) => (
                  <Badge key={origin} variant="idle">
                    {origin}: {total}
                  </Badge>
                ))}
              </div>

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-4">
                  <div className="border border-hair-2 bg-bg-0/60 px-4 py-4">
                    <div className="label bracket-label">{es.projects.filtersTitle}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor="records-search">{es.common.search}</Label>
                        <Input
                          id="records-search"
                          placeholder={es.common.search}
                          value={recordsQuery}
                          onChange={(e) => setRecordsQuery(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="records-origin">Origen</Label>
                        <select
                          id="records-origin"
                          className={SELECT_CLASS_NAME}
                          value={origenFilter}
                          onChange={(e) => setOrigenFilter(e.target.value)}
                        >
                          <option value="">{es.projects.allOrigins}</option>
                          {origenes.map((origin) => (
                            <option key={origin} value={origin}>
                              {origin}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border border-hair-2 bg-bg-0/60">
                    <div className="flex items-center justify-between gap-3 border-b border-hair-1 px-4 py-3">
                      <div>
                        <div className="label bracket-label">{es.projects.recordsTitle}</div>
                        <p className="mt-1 text-[12px] text-fg-3">
                          {filteredRegistros.length} / {registros.length} {es.common.records}
                        </p>
                      </div>
                    </div>
                    <div className="p-4">
                      <Table
                        columns={registroColumns}
                        rows={filteredRegistros}
                        getRowKey={(row) => String(row.id)}
                        empty={
                          recordsQuery || origenFilter
                            ? es.data.noResults
                            : es.projects.recordsEmpty
                        }
                      />
                    </div>
                  </div>
                </div>

                <aside className="border border-hair-2 bg-bg-0/60">
                  <div className="border-b border-hair-1 px-4 py-3">
                    <div className="label bracket-label">{es.projects.columnsTitle}</div>
                    <p className="mt-1 text-[12px] text-fg-3">
                      {visibleMetadataKeys.length} / {metadataKeys.length} visibles
                    </p>
                  </div>
                  <div className="space-y-4 px-4 py-4">
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        disabled={metadataKeys.length === 0}
                        onClick={() => setVisibleMetadataKeys(metadataKeys)}
                      >
                        {es.projects.allColumns}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={metadataKeys.length === 0}
                        onClick={() => setVisibleMetadataKeys([])}
                      >
                        {es.projects.noColumns}
                      </Button>
                    </div>

                    {metadataKeys.length === 0 ? (
                      <p className="text-[12px] text-fg-3">{es.projects.noMetadata}</p>
                    ) : (
                      <div className="space-y-2">
                        {metadataKeys.map((key) => {
                          const checked = visibleMetadataKeys.includes(key);
                          return (
                            <label
                              key={key}
                              htmlFor={`meta-col-${key}`}
                              className="flex items-center gap-2 border border-hair-1 px-3 py-2 text-[12px] text-fg-2"
                            >
                              <Checkbox
                                id={`meta-col-${key}`}
                                checked={checked}
                                onChange={(e) =>
                                  setVisibleMetadataKeys((prev) =>
                                    e.target.checked
                                      ? [...prev, key].sort((a, b) => a.localeCompare(b))
                                      : prev.filter((item) => item !== key),
                                  )
                                }
                              />
                              <span>{key}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ProjectForm
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={async (project) => {
            setDetail((prev) =>
              prev.data && prev.data.project.id === project.id
                ? { ...prev, data: { ...prev.data, project } }
                : prev,
            );
            setEditing(null);
            await handleProjectSaved(project.id);
          }}
        />
      )}

      {deleting && (
        <DeleteProjectDialog
          project={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={async (projectId) => {
            setDeleting(null);
            await handleProjectDeleted(projectId);
          }}
        />
      )}
    </AppShell>
  );
}

function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project: ProjectSummary | null;
  onClose: () => void;
  onSaved: (project: { id: number; nombre: string; createdAt: Date }) => Promise<void>;
}) {
  const isNew = !project;
  const [nombre, setNombre] = useState(project?.nombre ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit() {
    setBusy(true);
    setError('');
    try {
      const result = isNew
        ? await createProjectEntry({ data: { nombre } })
        : await updateProjectEntry({ data: { id: project.id, nombre } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onSaved(result.project);
    } catch (err) {
      console.error('[projects] save failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={isNew ? es.projects.newTitle : es.projects.editTitle} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-name" required>
            {es.projects.nameLabel}
          </Label>
          <Input id="project-name" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.nameHint}</p>
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <p className="text-[11px] text-fg-3">{es.forms.requiredLegend}</p>
        <div className="flex justify-end gap-2">
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

function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: {
  project: ProjectSummary;
  onClose: () => void;
  onDeleted: (projectId: number) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onConfirm() {
    setBusy(true);
    setError('');
    try {
      const result = await deleteProjectEntry({ data: { id: project.id } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      await onDeleted(project.id);
    } catch (err) {
      console.error('[projects] delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.data.deleteTitle}
      body={`${es.data.deleteBody} (${project.nombre})`}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-hair-2 bg-bg-0/70 px-4 py-4">
      <div className="label bracket-label">{label}</div>
      <div className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-fg-1">{value}</div>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatMetadataValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => formatMetadataValue(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function metadataCookieName(projectId: number) {
  return `achievers_project_meta_cols_${projectId}`;
}

function readMetadataCookie(projectId: number) {
  if (typeof document === 'undefined') return null;
  const prefix = `${metadataCookieName(projectId)}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!cookie) return null;

  try {
    const value = decodeURIComponent(cookie.slice(prefix.length));
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : null;
  } catch {
    return null;
  }
}

function writeMetadataCookie(projectId: number, columns: string[]) {
  if (typeof document === 'undefined') return;
  document.cookie = `${metadataCookieName(projectId)}=${encodeURIComponent(
    JSON.stringify(columns),
  )}; path=/; max-age=31536000; samesite=lax`;
}

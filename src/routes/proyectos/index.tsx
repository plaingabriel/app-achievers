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
  type EncuestaItem,
  type GrupoItem,
  type JsonValue,
  type ProjectDetail,
  type ProjectItem,
  type ProjectSummary,
  type ProjectsOverview,
  type RegistroItem,
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

type RegistroRow = RegistroItem;
type EncuestaRow = EncuestaItem;
type GrupoRow = GrupoItem;
type ChartDatum = {
  label: string;
  value: number;
  share: number;
  color: string;
};
type LineChartPoint = {
  xLabel: string;
  share: number;
};
type SurveyResponseCoverageCard = {
  key: string;
  answered: number;
  total: number;
  share: number;
  trend: LineChartPoint[];
};
type OriginScoreDatum = {
  label: string;
  average: number;
  count: number;
};
type ProjectView = 'registros' | 'encuestas' | 'grupos' | 'dash';

const BASE_COLUMN_KEYS = ['createdAt', 'nombre', 'correo', 'telefono', 'origen'] as const;
const SURVEY_BASE_COLUMN_KEYS = ['createdAt', 'contactId', 'score'] as const;
const SELECT_CLASS_NAME =
  'h-9 w-full rounded-none border border-hair-2 bg-bg-1 px-3 font-mono text-[13px] text-fg-1 outline-none transition-colors duration-140 ease-achievers focus-visible:border-brand focus-visible:shadow-[0_0_0_2px_rgba(245,158,11,0.18)]';
const CHART_COLORS = [
  '#f59e0b',
  '#f97316',
  '#0f766e',
  '#0284c7',
  '#be123c',
  '#7c3aed',
  '#65a30d',
  '#b45309',
] as const;

function ProjectsPage() {
  const data: ProjectsOverview = Route.useLoaderData();
  const router = useRouter();
  const hasProjects = data.projects.length > 0;

  const [projectQuery, setProjectQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(
    data.projects[0]?.id ?? null,
  );
  const [editing, setEditing] = useState<{ project: ProjectSummary | null } | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary | null>(null);
  const [activeView, setActiveView] = useState<ProjectView>('registros');
  const [recordsQuery, setRecordsQuery] = useState('');
  const [recordsDateFrom, setRecordsDateFrom] = useState('');
  const [recordsDateTo, setRecordsDateTo] = useState('');
  const [surveysQuery, setSurveysQuery] = useState('');
  const [surveysDateFrom, setSurveysDateFrom] = useState('');
  const [surveysDateTo, setSurveysDateTo] = useState('');
  const [groupsQuery, setGroupsQuery] = useState('');
  const [groupsDateFrom, setGroupsDateFrom] = useState('');
  const [groupsDateTo, setGroupsDateTo] = useState('');
  const [origenFilter, setOrigenFilter] = useState('');
  const [detail, setDetail] = useState<{
    loading: boolean;
    error: string;
    data: ProjectDetail | null;
  }>({ loading: false, error: '', data: null });
  const [visibleMetadataKeys, setVisibleMetadataKeys] = useState<string[]>([]);
  const [visibleSurveyKeys, setVisibleSurveyKeys] = useState<string[]>([]);
  const [originBaseKey, setOriginBaseKey] = useState('__origen__');
  const [metadataChartKey, setMetadataChartKey] = useState('');
  const [copiedEndpoint, setCopiedEndpoint] = useState<'registros' | 'encuestas' | 'grupos' | null>(
    null,
  );

  useEffect(() => {
    if (!hasProjects) {
      if (selectedProjectId !== null) setSelectedProjectId(null);
      return;
    }

    const stillExists = data.projects.some((project) => project.id === selectedProjectId);
    if (!stillExists) setSelectedProjectId(data.projects[0]?.id ?? null);
  }, [data.projects, hasProjects, selectedProjectId]);

  useEffect(() => {
    let cancelled = false;

    if (!hasProjects) {
      setDetail((prev) =>
        prev.loading || prev.error || prev.data ? { loading: false, error: '', data: null } : prev,
      );
      return () => {
        cancelled = true;
      };
    }

    async function loadDetail(projectId: number) {
      setDetail((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const projectDetail: ProjectDetail = await fetchProjectDetail({ data: { projectId } });
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
  }, [hasProjects, selectedProjectId]);

  useEffect(() => {
    if (!hasProjects) return;
    setRecordsQuery('');
    setRecordsDateFrom('');
    setRecordsDateTo('');
    setSurveysQuery('');
    setSurveysDateFrom('');
    setSurveysDateTo('');
    setGroupsQuery('');
    setGroupsDateFrom('');
    setGroupsDateTo('');
    setOrigenFilter('');
  }, [hasProjects]);

  const selectedProject = detail.data?.project ?? null;
  const registros = detail.data?.registros ?? [];
  const encuestas = detail.data?.encuestas ?? [];
  const grupos = detail.data?.grupos ?? [];

  const metadataKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of registros) {
      if (!isPlainObject(row.metadata)) continue;
      for (const key of Object.keys(row.metadata)) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [registros]);

  const surveyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const row of encuestas) {
      if (!isPlainObject(row.respuestas)) continue;
      for (const key of Object.keys(row.respuestas)) keys.add(key);
    }
    return Array.from(keys).sort((a, b) => a.localeCompare(b));
  }, [encuestas]);

  useEffect(() => {
    if (metadataKeys.length === 0) {
      setMetadataChartKey('');
      return;
    }

    setMetadataChartKey((current) =>
      current && metadataKeys.includes(current) ? current : (metadataKeys[0] ?? ''),
    );
  }, [metadataKeys]);

  useEffect(() => {
    if (originBaseKey === '__origen__') return;
    if (metadataKeys.includes(originBaseKey)) return;
    setOriginBaseKey('__origen__');
  }, [metadataKeys, originBaseKey]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) {
      setVisibleMetadataKeys((prev) => (prev.length > 0 ? [] : prev));
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
  }, [hasProjects, selectedProjectId, metadataKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) {
      setVisibleSurveyKeys((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    const saved = readSurveyColumnsCookie(selectedProjectId);
    if (!saved) {
      setVisibleSurveyKeys(surveyKeys);
      return;
    }

    const visibleSet = new Set(saved);
    const merged = [
      ...saved.filter((key) => surveyKeys.includes(key)),
      ...surveyKeys.filter((key) => !visibleSet.has(key)),
    ];
    setVisibleSurveyKeys(merged);
  }, [hasProjects, selectedProjectId, surveyKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) return;
    if (!detail.data || detail.data.project.id !== selectedProjectId) return;
    writeMetadataCookie(selectedProjectId, visibleMetadataKeys);
  }, [detail.data, hasProjects, selectedProjectId, visibleMetadataKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) return;
    if (!detail.data || detail.data.project.id !== selectedProjectId) return;
    writeSurveyColumnsCookie(selectedProjectId, visibleSurveyKeys);
  }, [detail.data, hasProjects, selectedProjectId, visibleSurveyKeys]);

  useEffect(() => {
    if (!copiedEndpoint) return;

    const timeoutId = window.setTimeout(() => setCopiedEndpoint(null), 1600);
    return () => window.clearTimeout(timeoutId);
  }, [copiedEndpoint]);

  const filteredProjects = useMemo<ProjectSummary[]>(() => {
    const q = projectQuery.trim().toLowerCase();
    if (!q) return data.projects;
    return data.projects.filter((project) => project.nombre.toLowerCase().includes(q));
  }, [data.projects, projectQuery]);

  const filteredRegistros = useMemo<RegistroRow[]>(() => {
    const q = recordsQuery.trim().toLowerCase();
    return registros.filter((row) => {
      if (origenFilter && row.origen !== origenFilter) return false;
      if (!isWithinDateRange(row.createdAt, recordsDateFrom, recordsDateTo)) return false;
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
  }, [recordsDateFrom, recordsDateTo, recordsQuery, registros, origenFilter]);

  const filteredGrupos = useMemo<GrupoRow[]>(() => {
    const q = groupsQuery.trim().toLowerCase();
    return grupos.filter((row) => {
      if (!isWithinDateRange(row.fecha, groupsDateFrom, groupsDateTo)) return false;
      if (!q) return true;
      return [row.telefono, row.campana, row.grupo, formatDateTime(row.fecha)]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [groupsDateFrom, groupsDateTo, grupos, groupsQuery]);

  const filteredEncuestas = useMemo<EncuestaRow[]>(() => {
    const q = surveysQuery.trim().toLowerCase();
    return encuestas.filter((row) => {
      if (!isWithinDateRange(row.createdAt, surveysDateFrom, surveysDateTo)) return false;
      if (!q) return true;
      const respuestasText = isPlainObject(row.respuestas)
        ? Object.entries(row.respuestas)
            .map(([key, value]) => `${key} ${formatMetadataValue(value)}`.toLowerCase())
            .join(' ')
        : formatMetadataValue(row.respuestas).toLowerCase();

      return [row.contactId, row.score === null ? '' : String(row.score), respuestasText]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [encuestas, surveysDateFrom, surveysDateTo, surveysQuery]);

  const origenes = useMemo<string[]>(
    () =>
      Array.from(new Set(registros.map((row) => row.origen))).sort((a, b) => a.localeCompare(b)),
    [registros],
  );

  const metrics = useMemo(() => {
    const emails = new Set(registros.map((row) => row.correo.trim().toLowerCase()).filter(Boolean));
    const withPhone = registros.filter((row) => !!row.telefono?.trim()).length;
    const origins = new Set(registros.map((row) => row.origen));
    const originsCount = new Map<string, number>();
    const registroPhones = new Set(
      registros
        .map((row) => normalizePhone(row.telefono))
        .filter((value): value is string => !!value),
    );
    const grupoPhones = new Set(
      grupos.map((row) => normalizePhone(row.telefono)).filter((value): value is string => !!value),
    );

    for (const row of registros) {
      originsCount.set(row.origen, (originsCount.get(row.origen) ?? 0) + 1);
    }

    let coveredPhones = 0;
    for (const phone of registroPhones) {
      if (grupoPhones.has(phone)) coveredPhones += 1;
    }

    const topOrigins: Array<[string, number]> = Array.from(originsCount.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 4);

    return {
      total: registros.length,
      filtered: filteredRegistros.length,
      encuestas: encuestas.length,
      filteredEncuestas: filteredEncuestas.length,
      grupos: grupos.length,
      filteredGrupos: filteredGrupos.length,
      uniqueEmails: emails.size,
      withPhone,
      origins: origins.size,
      uniquePhones: registroPhones.size,
      coveredPhones,
      coverage: registroPhones.size > 0 ? coveredPhones / registroPhones.size : 0,
      topOrigins,
    };
  }, [
    encuestas.length,
    filteredEncuestas.length,
    filteredGrupos.length,
    filteredRegistros.length,
    grupos,
    registros,
  ]);

  const originChartData = useMemo<ChartDatum[]>(
    () => buildChartData(filteredRegistros, (row) => readOriginBaseValue(row, originBaseKey)),
    [filteredRegistros, originBaseKey],
  );

  const metadataChartData = useMemo<ChartDatum[]>(
    () =>
      buildChartData(filteredRegistros, (row) => {
        if (!metadataChartKey || !isPlainObject(row.metadata)) return '';
        return formatMetadataValue(row.metadata[metadataChartKey]);
      }),
    [filteredRegistros, metadataChartKey],
  );

  const surveyResponseCards = useMemo<SurveyResponseCoverageCard[]>(
    () => buildSurveyResponseCoverageCards(encuestas, visibleSurveyKeys),
    [encuestas, visibleSurveyKeys],
  );

  const scoreMetrics = useMemo(() => {
    const filteredRegistroIds = new Set(filteredRegistros.map((row) => String(row.id)));
    const registrosById = new Map(filteredRegistros.map((row) => [String(row.id), row] as const));
    const scoredEncuestas = encuestas.filter(
      (row) => row.score !== null && filteredRegistroIds.has(row.contactId),
    );

    const averageScore =
      scoredEncuestas.length > 0
        ? scoredEncuestas.reduce((sum, row) => sum + (row.score ?? 0), 0) / scoredEncuestas.length
        : null;

    const byOrigin = new Map<string, { total: number; count: number }>();
    for (const row of scoredEncuestas) {
      const registro = registrosById.get(row.contactId);
      if (!registro) continue;
      const label = readOriginBaseValue(registro, originBaseKey);
      if (!label) continue;

      const entry = byOrigin.get(label) ?? { total: 0, count: 0 };
      entry.total += row.score ?? 0;
      entry.count += 1;
      byOrigin.set(label, entry);
    }

    const topOriginsByScore: OriginScoreDatum[] = Array.from(byOrigin.entries())
      .map(([label, value]) => ({
        label,
        average: value.count > 0 ? value.total / value.count : 0,
        count: value.count,
      }))
      .sort((a, b) => b.average - a.average || b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 6);

    return {
      averageScore,
      scoredCount: scoredEncuestas.length,
      topOriginsByScore,
    };
  }, [encuestas, filteredRegistros, originBaseKey]);

  const grupoColumns = useMemo<Column<GrupoRow>[]>(
    () => [
      {
        key: 'fecha',
        header: es.projects.groupDateCol,
        sortValue: (row) => Date.parse(row.fecha),
        render: (row) => <span className="text-fg-2">{formatDateTime(row.fecha)}</span>,
      },
      {
        key: 'telefono',
        header: es.projects.groupPhoneCol,
        sortValue: (row) => row.telefono,
        render: (row) => <span className="text-fg-1">{row.telefono}</span>,
      },
      {
        key: 'campana',
        header: es.projects.groupCampaignCol,
        sortValue: (row) => row.campana,
        render: (row) => <span className="text-fg-2">{row.campana}</span>,
      },
      {
        key: 'grupo',
        header: es.projects.groupNameCol,
        sortValue: (row) => row.grupo,
        render: (row) => <Badge variant="idle">{row.grupo}</Badge>,
      },
    ],
    [],
  );

  const encuestaColumns = useMemo<Column<EncuestaRow>[]>(() => {
    const baseColumns: Column<EncuestaRow>[] = [
      {
        key: 'createdAt',
        header: es.projects.createdCol,
        sortValue: (row) => Date.parse(row.createdAt),
        render: (row) => <span className="text-fg-2">{formatDateTime(row.createdAt)}</span>,
      },
      {
        key: 'contactId',
        header: es.projects.surveyContactCol,
        sortValue: (row) => row.contactId,
        render: (row) => <span className="text-fg-1">{row.contactId}</span>,
      },
      {
        key: 'score',
        header: es.projects.surveyScoreCol,
        sortValue: (row) => row.score ?? Number.NEGATIVE_INFINITY,
        render: (row) => <span className="text-fg-2">{row.score ?? '—'}</span>,
      },
    ];

    const visibleBase = baseColumns.filter((column) =>
      SURVEY_BASE_COLUMN_KEYS.includes(column.key as (typeof SURVEY_BASE_COLUMN_KEYS)[number]),
    );

    const answerColumns: Column<EncuestaRow>[] = visibleSurveyKeys.map((key) => ({
      key: `answer:${key}`,
      header: key,
      sortValue: (row) => formatMetadataValue(readSurveyAnswer(row, key)),
      render: (row) => (
        <span className="block max-w-[280px] truncate text-fg-2">
          {formatMetadataValue(readSurveyAnswer(row, key)) || '—'}
        </span>
      ),
    }));

    return [...visibleBase, ...answerColumns];
  }, [visibleSurveyKeys]);

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

  async function copyEndpoint(view: 'registros' | 'encuestas' | 'grupos') {
    if (!selectedProject) return;

    try {
      await navigator.clipboard.writeText(buildProjectEndpoint(view, selectedProject.id));
      setCopiedEndpoint(view);
    } catch {
      // Clipboard may be unavailable in some browsers/contexts.
    }
  }

  const registroColumns = useMemo<Column<RegistroRow>[]>(() => {
    const baseColumns: Column<RegistroRow>[] = [
      {
        key: 'createdAt',
        header: es.projects.createdCol,
        sortValue: (row) => Date.parse(row.createdAt),
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
                      <div className="flex flex-col items-end gap-2">
                        <Badge variant={isActive ? 'warning' : 'idle'}>
                          {project.registrosCount} {es.projects.recordsCol}
                        </Badge>
                        <Badge variant="idle">
                          {project.encuestasCount} {es.projects.surveysCol}
                        </Badge>
                        <Badge variant="info">
                          {project.gruposCount} {es.projects.groupsCol}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 text-[11px] text-fg-3 md:grid-cols-4">
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
                      <div>
                        <div className="label">{es.projects.latestSurveyCol}</div>
                        <div className="mt-1 text-fg-2">
                          {project.latestEncuestaAt
                            ? formatDateTime(project.latestEncuestaAt)
                            : 'â€”'}
                        </div>
                      </div>
                      <div>
                        <div className="label">{es.projects.latestGroupCol}</div>
                        <div className="mt-1 text-fg-2">
                          {project.latestGrupoAt ? formatDateTime(project.latestGrupoAt) : '—'}
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

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <MetricCard label={es.projects.recordsCol} value={metrics.total} />
                <MetricCard label={es.projects.surveysCol} value={metrics.encuestas} />
                <MetricCard label={es.projects.groupsCol} value={metrics.grupos} />
                <MetricCard label={es.projects.uniqueEmails} value={metrics.uniqueEmails} />
                <MetricCard label={es.projects.phones} value={metrics.withPhone} />
                <MetricCard label={es.projects.origins} value={metrics.origins} />
                <MetricCard
                  label={es.projects.coverageTitle}
                  value={formatPercent(metrics.coverage)}
                  hint={`${metrics.coveredPhones} / ${metrics.uniquePhones || 0}`}
                />
                <MetricCard label={es.projects.filtered} value={metrics.filtered} />
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

              <div className="flex flex-wrap gap-2 border-b border-hair-1 pb-4">
                <Button
                  variant={activeView === 'registros' ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => setActiveView('registros')}
                >
                  {es.projects.recordsTab}
                </Button>
                <Button
                  variant={activeView === 'encuestas' ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => setActiveView('encuestas')}
                >
                  {es.projects.surveysTab}
                </Button>
                <Button
                  variant={activeView === 'grupos' ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => setActiveView('grupos')}
                >
                  {es.projects.groupsTab}
                </Button>
                <Button
                  variant={activeView === 'dash' ? 'primary' : 'default'}
                  size="sm"
                  onClick={() => setActiveView('dash')}
                >
                  {es.projects.dashTab}
                </Button>
              </div>

              {activeView === 'dash' && (
                <section className="space-y-4 border border-hair-2 bg-bg-0/60 px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair-1 pb-4">
                    <div>
                      <div className="label bracket-label">{es.projects.dashboardTitle}</div>
                      <p className="mt-2 max-w-2xl text-[12px] text-fg-3">
                        {metrics.coveredPhones} / {metrics.uniquePhones || 0}{' '}
                        {es.projects.coverageHint}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="min-w-56">
                        <Label htmlFor="origin-base-key">{es.projects.originBaseField}</Label>
                        <select
                          id="origin-base-key"
                          className={cn(SELECT_CLASS_NAME, 'mt-2')}
                          value={originBaseKey}
                          onChange={(e) => setOriginBaseKey(e.target.value)}
                        >
                          <option value="__origen__">{es.projects.originBaseDefault}</option>
                          {metadataKeys.map((key) => (
                            <option key={key} value={key}>
                              {key}
                            </option>
                          ))}
                        </select>
                        <p className="mt-2 text-[11px] text-fg-3">
                          {es.projects.originBaseFieldHint}
                        </p>
                      </div>
                      {metadataKeys.length > 0 && (
                        <div className="min-w-56">
                          <Label htmlFor="metadata-chart-key">{es.projects.metadataField}</Label>
                          <select
                            id="metadata-chart-key"
                            className={cn(SELECT_CLASS_NAME, 'mt-2')}
                            value={metadataChartKey}
                            onChange={(e) => setMetadataChartKey(e.target.value)}
                          >
                            {metadataKeys.map((key) => (
                              <option key={key} value={key}>
                                {key}
                              </option>
                            ))}
                          </select>
                          <p className="mt-2 text-[11px] text-fg-3">
                            {es.projects.metadataFieldHint}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="border border-hair-2 bg-bg-1/80 px-4 py-4">
                      <div className="label bracket-label">{es.projects.coverageTitle}</div>
                      <div className="mt-4 text-[42px] font-bold tracking-[-0.04em] text-fg-1">
                        {formatPercent(metrics.coverage)}
                      </div>
                      <p className="mt-2 text-[12px] text-fg-3">{es.projects.coverageHint}</p>
                      <div className="mt-4 border border-hair-1 bg-bg-0/50 px-3 py-3 text-[12px] text-fg-2">
                        {metrics.coveredPhones} / {metrics.uniquePhones || 0} teléfonos únicos de
                        registros aparecen en grupos.
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <PieChartCard
                        title={`${es.projects.chartByOrigin}: ${formatOriginBaseLabel(originBaseKey)}`}
                        data={originChartData}
                        total={filteredRegistros.length}
                        emptyMessage={es.projects.chartEmpty}
                      />
                      <PieChartCard
                        title={
                          metadataChartKey
                            ? `${es.projects.chartByMetadata}: ${metadataChartKey}`
                            : es.projects.chartByMetadata
                        }
                        data={metadataChartData}
                        total={filteredRegistros.length}
                        emptyMessage={
                          metadataKeys.length === 0
                            ? es.projects.chartEmptyMetadata
                            : es.projects.chartEmpty
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <MetricCard
                      label={es.projects.averageScoreTitle}
                      value={
                        scoreMetrics.averageScore === null
                          ? '—'
                          : formatScore(scoreMetrics.averageScore)
                      }
                      hint={
                        scoreMetrics.scoredCount > 0
                          ? `${scoreMetrics.scoredCount} ${es.projects.scoredSurveys}`
                          : es.projects.noScoredSurveys
                      }
                    />
                    <OriginScoreCard
                      title={`${es.projects.topScoreOriginsTitle}: ${formatOriginBaseLabel(originBaseKey)}`}
                      items={scoreMetrics.topOriginsByScore}
                      emptyMessage={es.projects.noScoredOrigins}
                    />
                  </div>

                  <div className="border-t border-hair-1 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="label bracket-label">{es.projects.surveyCoverageTitle}</div>
                        <p className="mt-2 max-w-2xl text-[12px] text-fg-3">
                          {es.projects.surveyCoverageHint}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyKeys(surveyKeys)}
                        >
                          {es.projects.allCards}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyKeys([])}
                        >
                          {es.projects.noCards}
                        </Button>
                      </div>
                    </div>

                    {surveyKeys.length === 0 ? (
                      <div className="mt-4 border border-hair-2 bg-bg-1/80 px-4 py-8 text-[12px] text-fg-3">
                        {es.projects.noSurveyAnswers}
                      </div>
                    ) : surveyResponseCards.length === 0 ? (
                      <div className="mt-4 border border-hair-2 bg-bg-1/80 px-4 py-8 text-[12px] text-fg-3">
                        {es.projects.noVisibleSurveyCards}
                      </div>
                    ) : (
                      <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                        {surveyResponseCards.map((card) => (
                          <SurveyCoverageCard key={card.key} card={card} />
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {activeView === 'registros' && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="border border-hair-2 bg-bg-0/60 px-4 py-4">
                      <div className="label bracket-label">{es.projects.filtersTitle}</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
                        <div>
                          <Label htmlFor="records-date-from">{es.projects.dateFrom}</Label>
                          <Input
                            id="records-date-from"
                            type="date"
                            value={recordsDateFrom}
                            onChange={(e) => setRecordsDateFrom(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="records-date-to">{es.projects.dateTo}</Label>
                          <Input
                            id="records-date-to"
                            type="date"
                            value={recordsDateTo}
                            onChange={(e) => setRecordsDateTo(e.target.value)}
                          />
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
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => copyEndpoint('registros')}
                          >
                            {copiedEndpoint === 'registros'
                              ? es.projects.endpointCopied
                              : es.projects.copyEndpoint}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={filteredRegistros.length === 0}
                            onClick={() =>
                              exportRegistrosCsv(
                                selectedProject.nombre,
                                filteredRegistros,
                                visibleMetadataKeys,
                              )
                            }
                          >
                            {es.projects.exportCsv}
                          </Button>
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
              )}

              {activeView === 'encuestas' && (
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="space-y-4">
                    <div className="border border-hair-2 bg-bg-0/60 px-4 py-4">
                      <div className="label bracket-label">{es.projects.filtersTitle}</div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <Label htmlFor="surveys-search">{es.common.search}</Label>
                          <Input
                            id="surveys-search"
                            placeholder={es.common.search}
                            value={surveysQuery}
                            onChange={(e) => setSurveysQuery(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="surveys-date-from">{es.projects.dateFrom}</Label>
                          <Input
                            id="surveys-date-from"
                            type="date"
                            value={surveysDateFrom}
                            onChange={(e) => setSurveysDateFrom(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="surveys-date-to">{es.projects.dateTo}</Label>
                          <Input
                            id="surveys-date-to"
                            type="date"
                            value={surveysDateTo}
                            onChange={(e) => setSurveysDateTo(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border border-hair-2 bg-bg-0/60">
                      <div className="flex items-center justify-between gap-3 border-b border-hair-1 px-4 py-3">
                        <div>
                          <div className="label bracket-label">{es.projects.surveysTitle}</div>
                          <p className="mt-1 text-[12px] text-fg-3">
                            {filteredEncuestas.length} / {encuestas.length} {es.projects.surveysCol}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => copyEndpoint('encuestas')}
                          >
                            {copiedEndpoint === 'encuestas'
                              ? es.projects.endpointCopied
                              : es.projects.copyEndpoint}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={filteredEncuestas.length === 0}
                            onClick={() =>
                              exportEncuestasCsv(
                                selectedProject.nombre,
                                filteredEncuestas,
                                visibleSurveyKeys,
                              )
                            }
                          >
                            {es.projects.exportCsv}
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        <Table
                          columns={encuestaColumns}
                          rows={filteredEncuestas}
                          getRowKey={(row) => String(row.id)}
                          empty={surveysQuery ? es.data.noResults : es.projects.surveysEmpty}
                        />
                      </div>
                    </div>
                  </div>

                  <aside className="border border-hair-2 bg-bg-0/60">
                    <div className="border-b border-hair-1 px-4 py-3">
                      <div className="label bracket-label">{es.projects.surveyColumnsTitle}</div>
                      <p className="mt-1 text-[12px] text-fg-3">
                        {visibleSurveyKeys.length} / {surveyKeys.length} visibles
                      </p>
                    </div>
                    <div className="space-y-4 px-4 py-4">
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyKeys(surveyKeys)}
                        >
                          {es.projects.allColumns}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyKeys([])}
                        >
                          {es.projects.noColumns}
                        </Button>
                      </div>

                      {surveyKeys.length === 0 ? (
                        <p className="text-[12px] text-fg-3">{es.projects.noSurveyAnswers}</p>
                      ) : (
                        <div className="space-y-2">
                          {surveyKeys.map((key) => {
                            const checked = visibleSurveyKeys.includes(key);
                            return (
                              <label
                                key={key}
                                htmlFor={`survey-col-${key}`}
                                className="flex items-center gap-2 border border-hair-1 px-3 py-2 text-[12px] text-fg-2"
                              >
                                <Checkbox
                                  id={`survey-col-${key}`}
                                  checked={checked}
                                  onChange={(e) =>
                                    setVisibleSurveyKeys((prev) =>
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
              )}

              {activeView === 'grupos' && (
                <div className="space-y-4">
                  <div className="border border-hair-2 bg-bg-0/60 px-4 py-4">
                    <div className="label bracket-label">{es.projects.filtersTitle}</div>
                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      <div>
                        <Label htmlFor="groups-search">{es.common.search}</Label>
                        <Input
                          id="groups-search"
                          placeholder={es.common.search}
                          value={groupsQuery}
                          onChange={(e) => setGroupsQuery(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="groups-date-from">{es.projects.dateFrom}</Label>
                        <Input
                          id="groups-date-from"
                          type="date"
                          value={groupsDateFrom}
                          onChange={(e) => setGroupsDateFrom(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="groups-date-to">{es.projects.dateTo}</Label>
                        <Input
                          id="groups-date-to"
                          type="date"
                          value={groupsDateTo}
                          onChange={(e) => setGroupsDateTo(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border border-hair-2 bg-bg-0/60">
                    <div className="flex items-center justify-between gap-3 border-b border-hair-1 px-4 py-3">
                      <div>
                        <div className="label bracket-label">{es.projects.groupsTitle}</div>
                        <p className="mt-1 text-[12px] text-fg-3">
                          {filteredGrupos.length} / {grupos.length} {es.projects.groupsCol}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="default" size="sm" onClick={() => copyEndpoint('grupos')}>
                          {copiedEndpoint === 'grupos'
                            ? es.projects.endpointCopied
                            : es.projects.copyEndpoint}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={filteredGrupos.length === 0}
                          onClick={() => exportGruposCsv(selectedProject.nombre, filteredGrupos)}
                        >
                          {es.projects.exportCsv}
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      <Table
                        columns={grupoColumns}
                        rows={filteredGrupos}
                        getRowKey={(row) => String(row.id)}
                        empty={groupsQuery ? es.data.noResults : es.projects.groupsEmpty}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {editing && (
        <ProjectForm
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={async (project: ProjectItem) => {
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
  onSaved: (project: ProjectItem) => Promise<void>;
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

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="border border-hair-2 bg-bg-0/70 px-4 py-4">
      <div className="label bracket-label">{label}</div>
      <div className="mt-3 text-[28px] font-bold tracking-[-0.03em] text-fg-1">{value}</div>
      {hint && <div className="mt-2 text-[11px] text-fg-3">{hint}</div>}
    </div>
  );
}

function PieChartCard({
  title,
  data,
  total,
  emptyMessage,
}: {
  title: string;
  data: ChartDatum[];
  total: number;
  emptyMessage: string;
}) {
  const chartStyle = buildPieChartStyle(data);

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="label bracket-label">{title}</div>
        <p className="mt-1 text-[12px] text-fg-3">
          {total} {es.projects.visibleRecords}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{emptyMessage}</div>
      ) : (
        <div className="grid gap-5 px-4 py-4 md:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex items-center justify-center">
            <div className="relative flex size-48 items-center justify-center rounded-full border border-hair-1 bg-bg-0/60 p-4">
              <div
                className="size-full rounded-full border border-bg-1"
                style={chartStyle}
                aria-hidden="true"
              />
              <div className="absolute flex size-24 flex-col items-center justify-center rounded-full border border-hair-1 bg-bg-1 text-center">
                <span className="text-[10px] uppercase tracking-[0.24em] text-fg-3">
                  {es.projects.shareOfTotal}
                </span>
                <span className="mt-1 text-[24px] font-bold tracking-[-0.03em] text-fg-1">
                  100%
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {data.map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between gap-3 border border-hair-1 bg-bg-0/40 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ backgroundColor: item.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-medium text-fg-1">{item.label}</div>
                    <div className="text-[11px] text-fg-3">{formatPercent(item.share)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-bold text-fg-1">{item.value}</div>
                  <div className="text-[11px] text-fg-3">{es.common.records}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SurveyCoverageCard({ card }: { card: SurveyResponseCoverageCard }) {
  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="label bracket-label">{card.key}</div>
            <p className="mt-1 text-[12px] text-fg-3">
              {card.answered} / {card.total} {es.projects.respondedLabel}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[24px] font-bold tracking-[-0.03em] text-fg-1">
              {formatPercent(card.share)}
            </div>
            <div className="text-[11px] text-fg-3">{es.projects.responseRateLabel}</div>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <LineCoverageChart points={card.trend} />
        <div className="flex items-center justify-between text-[11px] text-fg-3">
          <span>{card.trend[0]?.xLabel ?? '—'}</span>
          <span>{card.trend[card.trend.length - 1]?.xLabel ?? '—'}</span>
        </div>
      </div>
    </div>
  );
}

function OriginScoreCard({
  title,
  items,
  emptyMessage,
}: {
  title: string;
  items: OriginScoreDatum[];
  emptyMessage: string;
}) {
  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="label bracket-label">{title}</div>
        <p className="mt-1 text-[12px] text-fg-3">{es.projects.averageScoreByOriginHint}</p>
      </div>

      {items.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{emptyMessage}</div>
      ) : (
        <div className="space-y-2 px-4 py-4">
          {items.map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between gap-3 border border-hair-1 bg-bg-0/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[12px] font-medium text-fg-1">{item.label}</div>
                <div className="text-[11px] text-fg-3">
                  {item.count} {es.projects.scoredSurveys}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[15px] font-bold text-fg-1">{formatScore(item.average)}</div>
                <div className="text-[11px] text-fg-3">{es.projects.averageLabel}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineCoverageChart({ points }: { points: LineChartPoint[] }) {
  if (points.length === 0) {
    return <div className="h-36 border border-hair-1 bg-bg-0/40" />;
  }

  const width = 320;
  const height = 144;
  const paddingX = 10;
  const paddingY = 12;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;

  const polylinePoints = points
    .map((point, index) => {
      const x =
        points.length === 1 ? width / 2 : paddingX + (index / (points.length - 1)) * innerWidth;
      const y = paddingY + (1 - point.share) * innerHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const areaPoints = `${paddingX},${height - paddingY} ${polylinePoints} ${width - paddingX},${height - paddingY}`;

  return (
    <div className="overflow-hidden border border-hair-1 bg-bg-0/40">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-36 w-full" aria-hidden="true">
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = paddingY + (1 - tick) * innerHeight;
          return (
            <g key={tick}>
              <line x1={0} y1={y} x2={width} y2={y} className="stroke-hair-1/80" strokeWidth="1" />
              <text x={width - 6} y={y - 4} textAnchor="end" className="fill-fg-4 text-[9px]">
                {formatPercent(tick)}
              </text>
            </g>
          );
        })}
        <polygon points={areaPoints} className="fill-brand/12" />
        <polyline
          points={polylinePoints}
          fill="none"
          className="stroke-brand"
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function formatDate(date: string | Date) {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(parsed);
}

function isWithinDateRange(value: string | Date, from: string, to: string) {
  const parsed = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(parsed.getTime())) return false;

  if (from) {
    const fromDate = new Date(`${from}T00:00:00`);
    if (parsed < fromDate) return false;
  }

  if (to) {
    const toDate = new Date(`${to}T23:59:59.999`);
    if (parsed > toDate) return false;
  }

  return true;
}

function formatDateTime(date: string | Date) {
  const parsed = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function isPlainObject(value: JsonValue | unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSurveyAnswer(row: EncuestaRow, key: string) {
  return isPlainObject(row.respuestas) ? row.respuestas[key] : undefined;
}

function readOriginBaseValue(row: RegistroRow, key: string) {
  if (key === '__origen__') return row.origen.trim();
  if (!isPlainObject(row.metadata)) return '';
  return formatMetadataValue(row.metadata[key]).trim();
}

function formatOriginBaseLabel(key: string) {
  return key === '__origen__' ? es.projects.originBaseDefault : key;
}

function hasResponseValue(value: JsonValue | unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasResponseValue(item));
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
  return true;
}

function formatMetadataValue(value: JsonValue | unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => formatMetadataValue(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function buildChartData(rows: RegistroRow[], getValue: (row: RegistroRow) => string): ChartDatum[] {
  const totals = new Map<string, number>();

  for (const row of rows) {
    const label = getValue(row).trim();
    if (!label) continue;
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }

  const total = Array.from(totals.values()).reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];

  return Array.from(totals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([label, value], index) => ({
      label,
      value,
      share: value / total,
      color: CHART_COLORS[index % CHART_COLORS.length] ?? CHART_COLORS[0],
    }));
}

function buildSurveyResponseCoverageCards(
  rows: EncuestaRow[],
  visibleKeys: string[],
): SurveyResponseCoverageCard[] {
  if (rows.length === 0) return [];

  const orderedRows = [...rows].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id,
  );

  return visibleKeys.map((key) => {
    let answered = 0;
    let processed = 0;
    const trend: LineChartPoint[] = [];

    for (const row of orderedRows) {
      processed += 1;
      if (hasResponseValue(readSurveyAnswer(row, key))) answered += 1;
      trend.push({
        xLabel: formatDate(row.createdAt),
        share: processed > 0 ? answered / processed : 0,
      });
    }

    return {
      key,
      answered,
      total: orderedRows.length,
      share: orderedRows.length > 0 ? answered / orderedRows.length : 0,
      trend,
    };
  });
}

function buildPieChartStyle(data: ChartDatum[]) {
  let offset = 0;
  const segments = data.map((item) => {
    const start = offset * 100;
    offset += item.share;
    const end = offset * 100;
    return `${item.color} ${start}% ${end}%`;
  });

  return {
    background: `conic-gradient(${segments.join(', ')})`,
  };
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatScore(value: number) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;

  // Treat Argentina numbers that come as `54...` and `549...` as the same
  // phone for cross-source coverage matching.
  if (digits.startsWith('549')) return `54${digits.slice(3)}`;

  return digits;
}

function buildProjectEndpoint(view: 'registros' | 'encuestas' | 'grupos', projectId: number) {
  const path = `/api/${view}?proyectoId=${projectId}`;
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).toString();
}

function exportRegistrosCsv(
  projectName: string,
  rows: RegistroRow[],
  visibleMetadataKeys: string[],
) {
  if (typeof document === 'undefined' || rows.length === 0) return;

  const headers = ['Creado', 'Nombre', 'Correo', 'Telefono', 'Origen', ...visibleMetadataKeys];
  const csvRows = [
    headers,
    ...rows.map((row) => [
      formatDateTime(row.createdAt),
      row.nombre,
      row.correo,
      row.telefono ?? '',
      row.origen,
      ...visibleMetadataKeys.map((key) =>
        isPlainObject(row.metadata) ? formatMetadataValue(row.metadata[key]) : '',
      ),
    ]),
  ];
  downloadCsv(`registros-${projectName}`, csvRows);
}

function exportGruposCsv(projectName: string, rows: GrupoRow[]) {
  if (typeof document === 'undefined' || rows.length === 0) return;

  const csvRows = [
    [
      es.projects.groupDateCol,
      es.projects.groupPhoneCol,
      es.projects.groupCampaignCol,
      es.projects.groupNameCol,
    ],
    ...rows.map((row) => [formatDateTime(row.fecha), row.telefono, row.campana, row.grupo]),
  ];

  downloadCsv(`grupos-${projectName}`, csvRows);
}

function exportEncuestasCsv(projectName: string, rows: EncuestaRow[], visibleSurveyKeys: string[]) {
  if (typeof document === 'undefined' || rows.length === 0) return;

  const csvRows = [
    [
      es.projects.createdCol,
      es.projects.surveyContactCol,
      es.projects.surveyScoreCol,
      ...visibleSurveyKeys,
    ],
    ...rows.map((row) => [
      formatDateTime(row.createdAt),
      row.contactId,
      row.score === null ? '' : String(row.score),
      ...visibleSurveyKeys.map((key) => formatMetadataValue(readSurveyAnswer(row, key))),
    ]),
  ];

  downloadCsv(`encuestas-${projectName}`, csvRows);
}

function escapeCsvCell(value: string) {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
}

function downloadCsv(baseName: string, rows: string[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = baseName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '');

  link.href = url;
  link.download = `${safeName || 'export'}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function metadataCookieName(projectId: number) {
  return `achievers_project_meta_cols_${projectId}`;
}

function surveyColumnsCookieName(projectId: number) {
  return `achievers_project_survey_cols_${projectId}`;
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

function readSurveyColumnsCookie(projectId: number) {
  if (typeof document === 'undefined') return null;
  const prefix = `${surveyColumnsCookieName(projectId)}=`;
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

function writeSurveyColumnsCookie(projectId: number, columns: string[]) {
  if (typeof document === 'undefined') return;
  document.cookie = `${surveyColumnsCookieName(projectId)}=${encodeURIComponent(
    JSON.stringify(columns),
  )}; path=/; max-age=31536000; samesite=lax`;
}

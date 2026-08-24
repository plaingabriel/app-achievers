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
import { hasPermission } from '@/lib/permissions';
import {
  type CsvImportMapping,
  type CsvImportResult,
  type CsvImportTarget,
  type EncuestaItem,
  type EncuestaScoreMode,
  type GrupoItem,
  type JsonValue,
  type ProjectDashMetrics,
  type ProjectEncuestasPage,
  type ProjectGruposPage,
  type ProjectItem,
  type ProjectMetaGoalMetricsResult,
  type ProjectPageMetricsItem,
  type ProjectPageMetricsResult,
  type ProjectRegistrosPage,
  type ProjectSummary,
  type ProjectVipSalesResult,
  type ProjectsOverview,
  type RegistroItem,
  createProjectEntry,
  deleteProjectEntry,
  fetchProjectDashMetrics,
  fetchProjectEncuestasExport,
  fetchProjectEncuestasPage,
  fetchProjectGruposExport,
  fetchProjectGruposPage,
  fetchProjectMetaGoalMetrics,
  fetchProjectPageMetrics,
  fetchProjectRegistrosExport,
  fetchProjectRegistrosPage,
  fetchProjectVipSales,
  fetchProjectsOverview,
  importProjectCsvRows,
  updateProjectEntry,
} from '@/lib/projects-dashboard-server';
import { requirePermission } from '@/lib/route-guards';
import { cn } from '@/lib/utils';
import { createFileRoute, useRouteContext, useRouter } from '@tanstack/react-router';
import {
  type ChangeEvent,
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';

export const Route = createFileRoute('/proyectos/')({
  beforeLoad: ({ context }) => requirePermission(context, 'projects:read'),
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
type SurveyResponseCoverageCard = {
  key: string;
  answered: number;
  total: number;
  values: ChartDatum[];
};
type OriginScoreDatum = {
  label: string;
  average: number;
  count: number;
};
type DailyMetricSeriesKey = 'registros' | 'encuestas' | 'grupos' | 'ventasVip';
type DailyMetricFilter = 'all' | DailyMetricSeriesKey;
type DailyMetricsPoint = {
  dateKey: string;
  label: string;
  registros: number;
  encuestas: number;
  grupos: number;
  ventasVip: number;
  encuestasVsRegistros: number | null;
  gruposVsEncuestas: number | null;
};
type DailyMetricsOriginBreakdown = {
  dateKey: string;
  items: Array<{ origin: string; registros: number; encuestas: number; grupos: number }>;
};
type PageMetricsTableRow = {
  id: string;
  endpointUrl: string;
  rotatorTitle: string;
  adName: string;
  externalKey: string | null;
  url: string;
  active: boolean;
  clicks: number;
  conversions: number;
  conversionRate: number;
  scorePromedio: number | null;
};
type PageState<T> = {
  loading: boolean;
  error: string;
  data: T | null;
};
type ProjectView = 'registros' | 'encuestas' | 'grupos' | 'dash';
type CsvImportDialogState = { target: CsvImportTarget };
type ProjectRowDeleteState =
  | { target: 'registros'; row: RegistroRow }
  | { target: 'encuestas'; row: EncuestaRow }
  | { target: 'grupos'; row: GrupoRow };
type CsvPreviewRow = Record<string, string>;
type CsvPreviewData = { headers: string[]; rows: CsvPreviewRow[] };
type CsvImportOption = {
  value: string;
  label: string;
  kind: CsvImportMapping['kind'];
  targetKey?: string;
};
type SurveyLeadLookupRow = Pick<
  RegistroRow,
  'id' | 'nombre' | 'correo' | 'telefono' | 'origen' | 'metadata' | 'createdAt'
>;

// Stable empty fallbacks. Returning a fresh `[]` on every render makes every
// downstream useMemo recompute and, through the effects that sync the visible
// column state, feeds an endless render loop while the data is still null.
const NO_REGISTROS: RegistroRow[] = [];
const NO_ENCUESTAS: EncuestaRow[] = [];
const NO_GRUPOS: GrupoRow[] = [];
const NO_CONTACTS: SurveyLeadLookupRow[] = [];
const NO_KEYS: string[] = [];
const NO_CHART_DATA: ChartDatum[] = [];
const NO_ORIGIN_SCORES: OriginScoreDatum[] = [];
const NO_TOP_ORIGINS: Array<[string, number]> = [];

const BASE_COLUMN_KEYS = ['createdAt', 'nombre', 'correo', 'telefono', 'origen'] as const;
const SURVEY_BASE_COLUMN_KEYS = ['createdAt', 'contactId', 'score'] as const;
const DAILY_METRICS_ORGANICO_FILTER = '__organico__';
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
const DAILY_METRIC_STYLES: Record<
  DailyMetricSeriesKey,
  { color: string; mutedClassName: string; glowClassName: string }
> = {
  registros: {
    color: '#f59e0b',
    mutedClassName: 'text-[#f59e0b]',
    glowClassName: 'shadow-[0_0_0_1px_rgba(245,158,11,0.25)]',
  },
  encuestas: {
    color: '#0284c7',
    mutedClassName: 'text-[#0284c7]',
    glowClassName: 'shadow-[0_0_0_1px_rgba(2,132,199,0.25)]',
  },
  grupos: {
    color: '#0f766e',
    mutedClassName: 'text-[#0f766e]',
    glowClassName: 'shadow-[0_0_0_1px_rgba(15,118,110,0.25)]',
  },
  ventasVip: {
    color: '#7c3aed',
    mutedClassName: 'text-[#7c3aed]',
    glowClassName: 'shadow-[0_0_0_1px_rgba(124,58,237,0.25)]',
  },
};

function ProjectsPage() {
  const data: ProjectsOverview = Route.useLoaderData();
  const router = useRouter();
  const { isAdmin, permissions } = useRouteContext({ from: '__root__' });
  const hasProjects = data.projects.length > 0;
  const canWriteProjects = isAdmin || hasPermission(permissions, 'projects:write');
  const canDeleteProjects = isAdmin || hasPermission(permissions, 'projects:delete');
  const canDeleteProjectRows = isAdmin;

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
  const [surveysScoreMode, setSurveysScoreMode] = useState<EncuestaScoreMode>('all');
  const [surveysScoreMin, setSurveysScoreMin] = useState('');
  const [surveysScoreMax, setSurveysScoreMax] = useState('');
  const [dashDateFrom, setDashDateFrom] = useState('');
  const [dashDateTo, setDashDateTo] = useState('');
  const [groupsQuery, setGroupsQuery] = useState('');
  const [groupsDateFrom, setGroupsDateFrom] = useState('');
  const [groupsDateTo, setGroupsDateTo] = useState('');
  const [origenFilter, setOrigenFilter] = useState('');
  const [detail, setDetail] = useState<{
    loading: boolean;
    error: string;
    data: ProjectDashMetrics | null;
    projectId: number | null;
  }>({ loading: false, error: '', data: null, projectId: null });
  const [visibleMetadataKeys, setVisibleMetadataKeys] = useState<string[]>([]);
  const [visibleSurveyKeys, setVisibleSurveyKeys] = useState<string[]>([]);
  const [visibleSurveyCardKeys, setVisibleSurveyCardKeys] = useState<string[]>([]);
  const [originBaseKey, setOriginBaseKey] = useState('__origen__');
  const [metadataChartKey, setMetadataChartKey] = useState('');
  const [copiedEndpoint, setCopiedEndpoint] = useState<'registros' | 'encuestas' | 'grupos' | null>(
    null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState<'registros' | 'encuestas' | 'grupos' | null>(null);
  const [exportError, setExportError] = useState<{
    view: 'registros' | 'encuestas' | 'grupos';
    message: string;
  } | null>(null);
  const [importing, setImporting] = useState<CsvImportDialogState | null>(null);
  const [deletingRow, setDeletingRow] = useState<ProjectRowDeleteState | null>(null);
  const [topOriginsPage, setTopOriginsPage] = useState(0);
  const [dailyMetricFilter, setDailyMetricFilter] = useState<DailyMetricFilter>('all');
  const [dailyMetricsOriginFilter, setDailyMetricsOriginFilter] = useState('');
  const [metaGoalMetrics, setMetaGoalMetrics] = useState<{
    loading: boolean;
    result: ProjectMetaGoalMetricsResult | null;
  }>({ loading: false, result: null });
  const [pageMetrics, setPageMetrics] = useState<{
    loading: boolean;
    result: ProjectPageMetricsResult | null;
  }>({ loading: false, result: null });
  const [vipSales, setVipSales] = useState<{
    loading: boolean;
    result: ProjectVipSalesResult | null;
  }>({ loading: false, result: null });
  const [recordsPageIndex, setRecordsPageIndex] = useState(0);
  const [recordsPageSize, setRecordsPageSize] = useState(25);
  const [recordsPage, setRecordsPage] = useState<PageState<ProjectRegistrosPage>>({
    loading: false,
    error: '',
    data: null,
  });
  const [surveysPageIndex, setSurveysPageIndex] = useState(0);
  const [surveysPageSize, setSurveysPageSize] = useState(25);
  const [surveysPage, setSurveysPage] = useState<PageState<ProjectEncuestasPage>>({
    loading: false,
    error: '',
    data: null,
  });
  const [groupsPageIndex, setGroupsPageIndex] = useState(0);
  const [groupsPageSize, setGroupsPageSize] = useState(25);
  const [groupsPage, setGroupsPage] = useState<PageState<ProjectGruposPage>>({
    loading: false,
    error: '',
    data: null,
  });
  const deferredRecordsQuery = useDeferredValue(recordsQuery);
  const deferredSurveysQuery = useDeferredValue(surveysQuery);
  const deferredGroupsQuery = useDeferredValue(groupsQuery);
  const recordsResetKey = `${selectedProjectId ?? 'none'}|${deferredRecordsQuery}|${origenFilter}|${recordsDateFrom}|${recordsDateTo}`;
  const surveysResetKey = `${selectedProjectId ?? 'none'}|${deferredSurveysQuery}|${surveysDateFrom}|${surveysDateTo}|${surveysScoreMode}|${surveysScoreMin}|${surveysScoreMax}`;
  const groupsResetKey = `${selectedProjectId ?? 'none'}|${deferredGroupsQuery}|${groupsDateFrom}|${groupsDateTo}`;

  const loadProjectDetail = useCallback(
    async (projectId: number, dateStart: string, dateEnd: string, baseKey: string) => {
      setDetail((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const metrics = await fetchProjectDashMetrics({
          data: { projectId, dateStart, dateEnd, originBaseKey: baseKey },
        });
        setDetail({ loading: false, error: '', data: metrics, projectId });
        return metrics;
      } catch (err) {
        console.error('[projects] dash metrics load failed', err);
        setDetail({ loading: false, error: es.errors.generic, data: null, projectId });
        return null;
      }
    },
    [],
  );

  const loadMetaGoalMetrics = useCallback(
    async (projectId: number, dateStart: string, dateEnd: string) => {
      setMetaGoalMetrics({ loading: true, result: null });
      try {
        const result = await fetchProjectMetaGoalMetrics({
          data: { projectId, dateStart, dateEnd },
        });
        setMetaGoalMetrics({ loading: false, result });
      } catch (err) {
        console.error('[projects] meta goal metrics load failed', err);
        setMetaGoalMetrics({
          loading: false,
          result: { status: 'error', message: es.projects.metaMetricsFetchFailed },
        });
      }
    },
    [],
  );

  const loadPageMetrics = useCallback(async (projectId: number) => {
    setPageMetrics({ loading: true, result: null });
    try {
      const result = await fetchProjectPageMetrics({ data: { projectId } });
      setPageMetrics({ loading: false, result });
    } catch (err) {
      console.error('[projects] page metrics load failed', err);
      setPageMetrics({
        loading: false,
        result: { status: 'error', message: es.projects.pageMetricsFetchFailed },
      });
    }
  }, []);

  const loadVipSales = useCallback(
    async (projectId: number, dateStart: string, dateEnd: string) => {
      setVipSales({ loading: true, result: null });
      try {
        const result = await fetchProjectVipSales({ data: { projectId, dateStart, dateEnd } });
        setVipSales({ loading: false, result });
      } catch (err) {
        console.error('[projects] vip sales load failed', err);
        setVipSales({
          loading: false,
          result: { status: 'error', message: es.projects.vipSalesFetchFailed },
        });
      }
    },
    [],
  );

  const loadRegistrosPage = useCallback(
    async (
      projectId: number,
      pageIndex: number,
      pageSize: number,
      query: string,
      origin: string,
      dateFrom: string,
      dateTo: string,
    ) => {
      setRecordsPage((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const result = await fetchProjectRegistrosPage({
          data: { projectId, pageIndex, pageSize, query, origin, dateFrom, dateTo },
        });
        setRecordsPage({ loading: false, error: '', data: result });
      } catch (err) {
        console.error('[projects] registros page load failed', err);
        setRecordsPage({ loading: false, error: es.errors.generic, data: null });
      }
    },
    [],
  );

  const loadEncuestasPage = useCallback(
    async (
      projectId: number,
      pageIndex: number,
      pageSize: number,
      query: string,
      dateFrom: string,
      dateTo: string,
      scoreMode: EncuestaScoreMode,
      scoreMin: string,
      scoreMax: string,
    ) => {
      setSurveysPage((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const result = await fetchProjectEncuestasPage({
          data: {
            projectId,
            pageIndex,
            pageSize,
            query,
            dateFrom,
            dateTo,
            scoreMode,
            scoreMin,
            scoreMax,
          },
        });
        setSurveysPage({ loading: false, error: '', data: result });
      } catch (err) {
        console.error('[projects] encuestas page load failed', err);
        setSurveysPage({ loading: false, error: es.errors.generic, data: null });
      }
    },
    [],
  );

  const loadGruposPage = useCallback(
    async (
      projectId: number,
      pageIndex: number,
      pageSize: number,
      query: string,
      dateFrom: string,
      dateTo: string,
    ) => {
      setGroupsPage((prev) => ({ ...prev, loading: true, error: '' }));
      try {
        const result = await fetchProjectGruposPage({
          data: { projectId, pageIndex, pageSize, query, dateFrom, dateTo },
        });
        setGroupsPage({ loading: false, error: '', data: result });
      } catch (err) {
        console.error('[projects] grupos page load failed', err);
        setGroupsPage({ loading: false, error: es.errors.generic, data: null });
      }
    },
    [],
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

    if (
      !hasProjects ||
      selectedProjectId === null ||
      activeView !== 'dash' ||
      !dashDateFrom ||
      !dashDateTo
    ) {
      setDetail((prev) =>
        prev.loading || prev.error || prev.data
          ? { loading: false, error: '', data: null, projectId: null }
          : prev,
      );
      return () => {
        cancelled = true;
      };
    }

    void loadProjectDetail(selectedProjectId, dashDateFrom, dashDateTo, originBaseKey);

    return () => {
      cancelled = true;
    };
  }, [
    activeView,
    dashDateFrom,
    dashDateTo,
    hasProjects,
    loadProjectDetail,
    originBaseKey,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (!hasProjects) return;
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    setRecordsQuery('');
    setRecordsDateFrom('');
    setRecordsDateTo('');
    setSurveysQuery('');
    setSurveysDateFrom('');
    setSurveysDateTo('');
    setDashDateFrom(formatDateInputValue(new Date(year, month, 1)));
    setDashDateTo(formatDateInputValue(new Date(year, month + 1, 0)));
    setGroupsQuery('');
    setGroupsDateFrom('');
    setGroupsDateTo('');
    setOrigenFilter('');
    setDailyMetricsOriginFilter('');
  }, [hasProjects]);

  useEffect(() => {
    void recordsResetKey;
    setRecordsPageIndex(0);
  }, [recordsResetKey]);

  useEffect(() => {
    void surveysResetKey;
    setSurveysPageIndex(0);
  }, [surveysResetKey]);

  useEffect(() => {
    void groupsResetKey;
    setGroupsPageIndex(0);
  }, [groupsResetKey]);

  useEffect(() => {
    if (activeView !== 'dash' || selectedProjectId === null || !dashDateFrom || !dashDateTo) {
      setMetaGoalMetrics((prev) =>
        prev.loading || prev.result ? { loading: false, result: null } : prev,
      );
      setPageMetrics((prev) =>
        prev.loading || prev.result ? { loading: false, result: null } : prev,
      );
      setVipSales((prev) =>
        prev.loading || prev.result ? { loading: false, result: null } : prev,
      );
      return;
    }

    void loadMetaGoalMetrics(selectedProjectId, dashDateFrom, dashDateTo);
    void loadPageMetrics(selectedProjectId);
    void loadVipSales(selectedProjectId, dashDateFrom, dashDateTo);
  }, [
    activeView,
    dashDateFrom,
    dashDateTo,
    loadMetaGoalMetrics,
    loadPageMetrics,
    loadVipSales,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (activeView !== 'registros' || selectedProjectId === null) return;
    void loadRegistrosPage(
      selectedProjectId,
      recordsPageIndex,
      recordsPageSize,
      deferredRecordsQuery,
      origenFilter,
      recordsDateFrom,
      recordsDateTo,
    );
  }, [
    activeView,
    deferredRecordsQuery,
    loadRegistrosPage,
    origenFilter,
    recordsDateFrom,
    recordsDateTo,
    recordsPageIndex,
    recordsPageSize,
    selectedProjectId,
  ]);

  useEffect(() => {
    if (activeView !== 'encuestas' || selectedProjectId === null) return;
    void loadEncuestasPage(
      selectedProjectId,
      surveysPageIndex,
      surveysPageSize,
      deferredSurveysQuery,
      surveysDateFrom,
      surveysDateTo,
      surveysScoreMode,
      surveysScoreMin,
      surveysScoreMax,
    );
  }, [
    activeView,
    deferredSurveysQuery,
    loadEncuestasPage,
    selectedProjectId,
    surveysDateFrom,
    surveysDateTo,
    surveysPageIndex,
    surveysPageSize,
    surveysScoreMode,
    surveysScoreMin,
    surveysScoreMax,
  ]);

  useEffect(() => {
    if (activeView !== 'grupos' || selectedProjectId === null) return;
    void loadGruposPage(
      selectedProjectId,
      groupsPageIndex,
      groupsPageSize,
      deferredGroupsQuery,
      groupsDateFrom,
      groupsDateTo,
    );
  }, [
    activeView,
    deferredGroupsQuery,
    groupsDateFrom,
    groupsDateTo,
    groupsPageIndex,
    groupsPageSize,
    loadGruposPage,
    selectedProjectId,
  ]);

  const selectedProjectSummary =
    data.projects.find((project) => project.id === selectedProjectId) ?? null;
  const selectedProject = selectedProjectSummary;
  // The dash no longer receives rows: it renders `dashMetrics`, reduced server
  // side. The row arrays below only ever hold the current page of a list view.
  const dashMetrics = detail.data;
  const registros = recordsPage.data?.rows ?? NO_REGISTROS;
  const encuestas = surveysPage.data?.rows ?? NO_ENCUESTAS;
  const grupos = groupsPage.data?.rows ?? NO_GRUPOS;
  const surveyContactRows: SurveyLeadLookupRow[] = surveysPage.data?.contactos ?? NO_CONTACTS;
  const registrosById = useMemo(
    () =>
      new Map(
        surveyContactRows.map((row) => [String(row.id), row]) as Array<
          [string, SurveyLeadLookupRow]
        >,
      ),
    [surveyContactRows],
  );
  const registroSearchIndex = useMemo(
    () =>
      new Map(
        registros.map(
          (row) => [row.id, normalizeSearchText(buildRegistroSearchText(row))] as const,
        ),
      ),
    [registros],
  );
  const encuestaSearchIndex = useMemo(
    () =>
      new Map(
        encuestas.map(
          (row) => [row.id, normalizeSearchText(buildEncuestaSearchText(row))] as const,
        ),
      ),
    [encuestas],
  );
  const grupoSearchIndex = useMemo(
    () =>
      new Map(
        grupos.map((row) => [row.id, normalizeSearchText(buildGrupoSearchText(row))] as const),
      ),
    [grupos],
  );

  // Every view gets its keys from the server: list views from the paginated
  // endpoint (which scans the whole project), the dash from the aggregates.
  const metadataKeys = useMemo(() => {
    if (activeView !== 'dash') return recordsPage.data?.metadataKeys ?? NO_KEYS;
    return dashMetrics?.metadataKeys ?? NO_KEYS;
  }, [activeView, dashMetrics?.metadataKeys, recordsPage.data?.metadataKeys]);

  const surveyKeys = useMemo(() => {
    if (activeView !== 'dash') return surveysPage.data?.surveyKeys ?? NO_KEYS;
    return dashMetrics?.surveyKeys ?? NO_KEYS;
  }, [activeView, dashMetrics?.surveyKeys, surveysPage.data?.surveyKeys]);

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

  // The daily filter holds a value of the previous base key, which no longer
  // exists in the new breakdown.
  useEffect(() => {
    void originBaseKey;
    setDailyMetricsOriginFilter('');
  }, [originBaseKey]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) {
      setVisibleMetadataKeys((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    const saved = readMetadataCookie(selectedProjectId);
    if (!saved) {
      setVisibleMetadataKeys((prev) => (sameKeys(prev, metadataKeys) ? prev : metadataKeys));
      return;
    }

    const visibleSet = new Set(saved);
    const merged = [
      ...saved.filter((key) => metadataKeys.includes(key)),
      ...metadataKeys.filter((key) => !visibleSet.has(key)),
    ];
    setVisibleMetadataKeys((prev) => (sameKeys(prev, merged) ? prev : merged));
  }, [hasProjects, selectedProjectId, metadataKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) {
      setVisibleSurveyKeys((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    const saved = readSurveyColumnsCookie(selectedProjectId);
    if (!saved) {
      setVisibleSurveyKeys((prev) => (sameKeys(prev, surveyKeys) ? prev : surveyKeys));
      return;
    }

    const visibleSet = new Set(saved);
    const merged = [
      ...saved.filter((key) => surveyKeys.includes(key)),
      ...surveyKeys.filter((key) => !visibleSet.has(key)),
    ];
    setVisibleSurveyKeys((prev) => (sameKeys(prev, merged) ? prev : merged));
  }, [hasProjects, selectedProjectId, surveyKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) {
      setVisibleSurveyCardKeys((prev) => (prev.length > 0 ? [] : prev));
      return;
    }

    const saved = readSurveyCardsCookie(selectedProjectId);
    if (!saved) {
      setVisibleSurveyCardKeys((prev) => (sameKeys(prev, surveyKeys) ? prev : surveyKeys));
      return;
    }

    const visibleSet = new Set(saved);
    const merged = [
      ...saved.filter((key) => surveyKeys.includes(key)),
      ...surveyKeys.filter((key) => !visibleSet.has(key)),
    ];
    setVisibleSurveyCardKeys((prev) => (sameKeys(prev, merged) ? prev : merged));
  }, [hasProjects, selectedProjectId, surveyKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) return;
    if (!detail.data || detail.projectId !== selectedProjectId) return;
    writeMetadataCookie(selectedProjectId, visibleMetadataKeys);
  }, [detail.data, detail.projectId, hasProjects, selectedProjectId, visibleMetadataKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) return;
    if (!detail.data || detail.projectId !== selectedProjectId) return;
    writeSurveyColumnsCookie(selectedProjectId, visibleSurveyKeys);
  }, [detail.data, detail.projectId, hasProjects, selectedProjectId, visibleSurveyKeys]);

  useEffect(() => {
    if (!hasProjects || !selectedProjectId) return;
    if (!detail.data || detail.projectId !== selectedProjectId) return;
    writeSurveyCardsCookie(selectedProjectId, visibleSurveyCardKeys);
  }, [detail.data, detail.projectId, hasProjects, selectedProjectId, visibleSurveyCardKeys]);

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
    if (activeView !== 'dash') return recordsPage.data?.rows ?? NO_REGISTROS;
    const q = normalizeSearchText(deferredRecordsQuery);
    return registros.filter((row) => {
      if (origenFilter && row.origen !== origenFilter) return false;
      if (!isWithinDateRange(row.createdAt, recordsDateFrom, recordsDateTo)) return false;
      if (!q) return true;

      return (registroSearchIndex.get(row.id) ?? '').includes(q);
    });
  }, [
    activeView,
    deferredRecordsQuery,
    recordsDateFrom,
    recordsDateTo,
    registros,
    origenFilter,
    recordsPage.data?.rows,
    registroSearchIndex,
  ]);

  const filteredGrupos = useMemo<GrupoRow[]>(() => {
    if (activeView !== 'dash') return groupsPage.data?.rows ?? NO_GRUPOS;
    const q = normalizeSearchText(deferredGroupsQuery);
    return grupos.filter((row) => {
      if (!isWithinDateRange(row.fecha, groupsDateFrom, groupsDateTo)) return false;
      if (!q) return true;
      return (grupoSearchIndex.get(row.id) ?? '').includes(q);
    });
  }, [
    activeView,
    deferredGroupsQuery,
    grupoSearchIndex,
    groupsDateFrom,
    groupsDateTo,
    groupsPage.data?.rows,
    grupos,
  ]);

  const filteredEncuestas = useMemo<EncuestaRow[]>(() => {
    if (activeView !== 'dash') return surveysPage.data?.rows ?? NO_ENCUESTAS;
    const q = normalizeSearchText(deferredSurveysQuery);
    return encuestas.filter((row) => {
      if (!isWithinDateRange(row.createdAt, surveysDateFrom, surveysDateTo)) return false;
      if (!q) return true;
      return (encuestaSearchIndex.get(row.id) ?? '').includes(q);
    });
  }, [
    activeView,
    deferredSurveysQuery,
    encuestas,
    encuestaSearchIndex,
    surveysDateFrom,
    surveysDateTo,
    surveysPage.data?.rows,
  ]);

  // Both numbers come from the server: the sales platform owns the project → sale
  // relation, and the denominator is counted in SQL so the card keeps working
  // even when the dash aggregates do not load.
  const vipMetrics = useMemo(() => {
    if (vipSales.result?.status !== 'success') return { sales: 0, leadsInGroups: 0, rate: null };
    const { count, leadsInGroups } = vipSales.result.sales;

    return {
      sales: count,
      leadsInGroups,
      rate: leadsInGroups > 0 ? count / leadsInGroups : null,
    };
  }, [vipSales.result]);

  // Project-wide figures come from the dash aggregates; in the list views only
  // the counters the overview already provides are known.
  const metrics = useMemo(() => {
    const totals = dashMetrics?.totals ?? null;
    // "Filtrados" only has a meaning where a registro filter exists: the list of
    // registros, or the dash date range.
    const filtered =
      activeView === 'registros'
        ? (recordsPage.data?.total ?? 0)
        : activeView === 'dash'
          ? (dashMetrics?.range.registros ?? 0)
          : null;

    return {
      total: selectedProjectSummary?.registrosCount ?? 0,
      filtered,
      encuestas: selectedProjectSummary?.encuestasCount ?? 0,
      grupos: selectedProjectSummary?.gruposCount ?? 0,
      uniqueEmails: totals?.uniqueEmails ?? null,
      withPhone: totals?.withPhone ?? null,
      origins: totals?.origins ?? null,
      uniquePhones: totals?.uniquePhones ?? 0,
      coveredPhones: totals?.coveredPhones ?? 0,
      coverage:
        totals && totals.uniquePhones > 0 ? totals.coveredPhones / totals.uniquePhones : null,
      topOrigins: dashMetrics?.topOrigins ?? NO_TOP_ORIGINS,
    };
  }, [
    activeView,
    dashMetrics,
    recordsPage.data?.total,
    selectedProjectSummary?.encuestasCount,
    selectedProjectSummary?.gruposCount,
    selectedProjectSummary?.registrosCount,
  ]);

  const origenes = useMemo<string[]>(
    () =>
      activeView === 'dash'
        ? (dashMetrics?.origins ?? NO_KEYS)
        : (recordsPage.data?.origins ?? NO_KEYS),
    [activeView, dashMetrics?.origins, recordsPage.data?.origins],
  );

  // Which origins the organic campaign rule matched, resolved server side.
  const organicOrigins = useMemo(
    () => new Set(dashMetrics?.organicOrigins ?? NO_KEYS),
    [dashMetrics?.organicOrigins],
  );

  // Which base key the loaded breakdown was built with. Reading it from the
  // payload instead of from the selector keeps the options and the series in
  // sync while a refetch is in flight.
  const dailyOriginBaseKey = dashMetrics?.dailyOriginBaseKey ?? '__origen__';

  const dailyMetricsOriginOptions = useMemo(() => {
    // A metadata base groups by values the dash only knows from the breakdown
    // itself, and the organic rule is written against `origen`, so it does not
    // apply here.
    if (dailyOriginBaseKey !== '__origen__') {
      const values = new Set<string>();
      for (const { items } of dashMetrics?.dailyByOrigin ?? []) {
        for (const item of items) values.add(item.origin);
      }
      return Array.from(values)
        .sort((a, b) => a.localeCompare(b))
        .map((origin) => ({ value: origin, label: origin }));
    }

    return organicOrigins.size > 0
      ? [
          { value: DAILY_METRICS_ORGANICO_FILTER, label: 'organico' },
          ...origenes.map((origin) => ({ value: origin, label: origin })),
        ]
      : origenes.map((origin) => ({ value: origin, label: origin }));
  }, [dailyOriginBaseKey, dashMetrics?.dailyByOrigin, organicOrigins, origenes]);

  const rangeCoverage = useMemo(() => {
    const range = dashMetrics?.range;
    if (!range || range.uniquePhones === 0) return null;
    return range.coveredPhones / range.uniquePhones;
  }, [dashMetrics?.range]);

  const originChartData = useMemo<ChartDatum[]>(
    () => dashMetrics?.distributions[originBaseKey] ?? NO_CHART_DATA,
    [dashMetrics?.distributions, originBaseKey],
  );

  const TOP_ORIGINS_PAGE_SIZE = 10;
  const topOriginsPageCount = Math.max(
    1,
    Math.ceil(metrics.topOrigins.length / TOP_ORIGINS_PAGE_SIZE),
  );
  const safeTopOriginsPage = Math.min(topOriginsPage, topOriginsPageCount - 1);
  const paginatedTopOrigins = metrics.topOrigins.slice(
    safeTopOriginsPage * TOP_ORIGINS_PAGE_SIZE,
    (safeTopOriginsPage + 1) * TOP_ORIGINS_PAGE_SIZE,
  );

  useEffect(() => {
    if (topOriginsPage !== safeTopOriginsPage) {
      setTopOriginsPage(safeTopOriginsPage);
    }
  }, [safeTopOriginsPage, topOriginsPage]);

  const metadataChartData = useMemo<ChartDatum[]>(
    () =>
      metadataChartKey
        ? (dashMetrics?.distributions[metadataChartKey] ?? NO_CHART_DATA)
        : NO_CHART_DATA,
    [dashMetrics?.distributions, metadataChartKey],
  );

  const surveyResponseCards = useMemo<SurveyResponseCoverageCard[]>(
    () =>
      visibleSurveyCardKeys.map((key) => {
        const card = dashMetrics?.surveyCards[key];
        return {
          key,
          answered: card?.answered ?? 0,
          total: card?.total ?? 0,
          values: card?.values ?? NO_CHART_DATA,
        };
      }),
    [dashMetrics?.surveyCards, visibleSurveyCardKeys],
  );

  const scoreMetrics = useMemo(
    () => ({
      averageScore: dashMetrics?.score.average ?? null,
      scoredCount: dashMetrics?.score.scoredCount ?? 0,
      topOriginsByScore: dashMetrics?.score.byBaseKey[originBaseKey] ?? NO_ORIGIN_SCORES,
    }),
    [dashMetrics?.score, originBaseKey],
  );

  // Sales carry no lead origin, so this series ignores the origin filter and
  // always shows the project total per day (see `vipSalesNoOriginBreakdown`).
  const dailyVipSalesByDay = useMemo<Map<string, number>>(() => {
    if (vipSales.result?.status !== 'success') return new Map();
    return new Map(vipSales.result.sales.daily.map((day) => [day.fechaKey, day.count]));
  }, [vipSales.result]);

  // The origin filter is applied over the per-origin breakdown the server sends,
  // so switching origins never needs another request.
  const dailyMetrics = useMemo<DailyMetricsPoint[]>(() => {
    if (!dashMetrics) return buildDailyMetricsTimeline([], dailyVipSalesByDay);

    if (!dailyMetricsOriginFilter) {
      return buildDailyMetricsTimeline(dashMetrics.daily, dailyVipSalesByDay);
    }

    const matchesFilter = (origin: string) =>
      dailyMetricsOriginFilter === DAILY_METRICS_ORGANICO_FILTER
        ? organicOrigins.has(origin)
        : origin === dailyMetricsOriginFilter;

    const filtered = dashMetrics.dailyByOrigin.map(({ dateKey, items }) => {
      const totals = { dateKey, registros: 0, encuestas: 0, grupos: 0 };
      for (const item of items) {
        if (!matchesFilter(item.origin)) continue;
        totals.registros += item.registros;
        totals.encuestas += item.encuestas;
        totals.grupos += item.grupos;
      }
      return totals;
    });

    return buildDailyMetricsTimeline(filtered, dailyVipSalesByDay);
  }, [dailyMetricsOriginFilter, dailyVipSalesByDay, dashMetrics, organicOrigins]);

  const dailyMetricsOriginBreakdown = useMemo<DailyMetricsOriginBreakdown[]>(() => {
    if (dailyMetricsOriginFilter !== DAILY_METRICS_ORGANICO_FILTER || !dashMetrics) return [];

    return dashMetrics.dailyByOrigin
      .map(({ dateKey, items }) => ({
        dateKey,
        items: items.filter((item) => organicOrigins.has(item.origin)),
      }))
      .filter((entry) => entry.items.length > 0);
  }, [dailyMetricsOriginFilter, dashMetrics, organicOrigins]);

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
        sortValue: (row) => buildSurveyLeadSortValue(row, registrosById),
        render: (row) => renderSurveyLeadCell(row, registrosById),
      },
      {
        key: 'score',
        header: es.projects.surveyScoreCol,
        sortValue: (row) => row.score ?? Number.NEGATIVE_INFINITY,
        render: (row) => <span className="text-fg-2">{row.score ?? '-'}</span>,
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
          {formatMetadataValue(readSurveyAnswer(row, key)) || '-'}
        </span>
      ),
    }));

    return [...visibleBase, ...answerColumns];
  }, [registrosById, visibleSurveyKeys]);

  async function refreshOverview() {
    await router.invalidate();
  }

  async function refreshProjectData() {
    if (refreshing) return;

    setRefreshing(true);
    try {
      await refreshOverview();
      if (selectedProjectId !== null) {
        if (activeView === 'dash') {
          await loadProjectDetail(selectedProjectId, dashDateFrom, dashDateTo, originBaseKey);
          await loadMetaGoalMetrics(selectedProjectId, dashDateFrom, dashDateTo);
          await loadPageMetrics(selectedProjectId);
          await loadVipSales(selectedProjectId, dashDateFrom, dashDateTo);
        } else if (activeView === 'registros') {
          await loadRegistrosPage(
            selectedProjectId,
            recordsPageIndex,
            recordsPageSize,
            deferredRecordsQuery,
            origenFilter,
            recordsDateFrom,
            recordsDateTo,
          );
        } else if (activeView === 'encuestas') {
          await loadEncuestasPage(
            selectedProjectId,
            surveysPageIndex,
            surveysPageSize,
            deferredSurveysQuery,
            surveysDateFrom,
            surveysDateTo,
            surveysScoreMode,
            surveysScoreMin,
            surveysScoreMax,
          );
        } else if (activeView === 'grupos') {
          await loadGruposPage(
            selectedProjectId,
            groupsPageIndex,
            groupsPageSize,
            deferredGroupsQuery,
            groupsDateFrom,
            groupsDateTo,
          );
        }
      }
    } finally {
      setRefreshing(false);
    }
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

  async function handleRowDeleted() {
    if (selectedProjectId === null) return;
    await refreshProjectData();
  }

  async function handleExportRegistros() {
    if (!selectedProject || selectedProjectId === null) return;

    setExporting('registros');
    setExportError(null);
    try {
      const result = await fetchProjectRegistrosExport({
        data: {
          projectId: selectedProjectId,
          query: deferredRecordsQuery,
          origin: origenFilter,
          dateFrom: recordsDateFrom,
          dateTo: recordsDateTo,
        },
      });
      exportRegistrosCsv(selectedProject.nombre, result.rows, visibleMetadataKeys);
    } catch (err) {
      console.error('[projects] registros export failed', err);
      setExportError({ view: 'registros', message: es.projects.exportCsvFailed });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportEncuestas() {
    if (!selectedProject || selectedProjectId === null) return;

    setExporting('encuestas');
    setExportError(null);
    try {
      const result = await fetchProjectEncuestasExport({
        data: {
          projectId: selectedProjectId,
          query: deferredSurveysQuery,
          dateFrom: surveysDateFrom,
          dateTo: surveysDateTo,
          scoreMode: surveysScoreMode,
          scoreMin: surveysScoreMin,
          scoreMax: surveysScoreMax,
        },
      });
      exportEncuestasCsv(
        selectedProject.nombre,
        result.rows,
        result.contactos,
        collectJsonKeys(result.contactos.map((row) => row.metadata)),
        visibleSurveyKeys,
      );
    } catch (err) {
      console.error('[projects] encuestas export failed', err);
      setExportError({ view: 'encuestas', message: es.projects.exportCsvFailed });
    } finally {
      setExporting(null);
    }
  }

  async function handleExportGrupos() {
    if (!selectedProject || selectedProjectId === null) return;

    setExporting('grupos');
    setExportError(null);
    try {
      const result = await fetchProjectGruposExport({
        data: {
          projectId: selectedProjectId,
          query: deferredGroupsQuery,
          dateFrom: groupsDateFrom,
          dateTo: groupsDateTo,
        },
      });
      exportGruposCsv(selectedProject.nombre, result.rows);
    } catch (err) {
      console.error('[projects] grupos export failed', err);
      setExportError({ view: 'grupos', message: es.projects.exportCsvFailed });
    } finally {
      setExporting(null);
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
        render: (row) => <span className="text-fg-2">{row.telefono ?? '-'}</span>,
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
        return <span className="text-fg-2">{formatMetadataValue(value) || '-'}</span>;
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
            <Button
              variant="primary"
              disabled={!canWriteProjects}
              onClick={() => setEditing({ project: null })}
            >
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
                    onClick={() => {
                      setSelectedProjectId(project.id);
                      setTopOriginsPage(0);
                    }}
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
                            : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="label">{es.projects.latestSurveyCol}</div>
                        <div className="mt-1 text-fg-2">
                          {project.latestEncuestaAt
                            ? formatDateTime(project.latestEncuestaAt)
                            : '—'}
                        </div>
                      </div>
                      <div>
                        <div className="label">{es.projects.latestGroupCol}</div>
                        <div className="mt-1 text-fg-2">
                          {project.latestGrupoAt ? formatDateTime(project.latestGrupoAt) : '-'}
                        </div>
                      </div>
                    </div>
                  </button>
                  <div className="flex items-center justify-end gap-1 border-t border-hair-1 px-3 py-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canWriteProjects}
                      onClick={() => setEditing({ project })}
                    >
                      {es.common.edit}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!canDeleteProjects}
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
          {!selectedProject && (
            <div className="px-5 py-7 text-[13px] text-fg-3">{es.projects.selectHint}</div>
          )}

          {selectedProject && (
            <div className="space-y-6 px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-hair-1 pb-5">
                <div>
                  <div className="label bracket-label">{es.projects.metricsTitle}</div>
                  <h2 className="mt-2 text-[24px] font-bold tracking-[-0.02em] text-fg-1">
                    {selectedProject.nombre}
                  </h2>
                  <p className="mt-2 max-w-2xl text-[12px] text-fg-3">{es.projects.recordsTitle}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    disabled={refreshing}
                    onClick={() => void refreshProjectData()}
                  >
                    {refreshing ? 'Actualizando...' : 'Actualizar'}
                  </Button>
                  <Badge variant="warning">
                    {selectedProjectSummary?.registrosCount ?? 0} {es.projects.recordsCol}
                  </Badge>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <MetricCard
                  label={es.projects.recordsCol}
                  value={selectedProjectSummary?.registrosCount ?? 0}
                />
                <MetricCard
                  label={es.projects.surveysCol}
                  value={selectedProjectSummary?.encuestasCount ?? 0}
                />
                <MetricCard
                  label={es.projects.groupsCol}
                  value={selectedProjectSummary?.gruposCount ?? 0}
                />
                <MetricCard label={es.projects.uniqueEmails} value={metrics.uniqueEmails ?? '—'} />
                <MetricCard label={es.projects.phones} value={metrics.withPhone ?? '—'} />
                <MetricCard label={es.projects.origins} value={metrics.origins ?? '—'} />
                <MetricCard
                  label={es.projects.coverageTitle}
                  value={formatNullablePercent(metrics.coverage)}
                  hint={`${metrics.coveredPhones} / ${metrics.uniquePhones || 0}`}
                />
                <MetricCard label={es.projects.filtered} value={metrics.filtered ?? '—'} />
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label">{es.projects.topOrigins}</span>
                    {metrics.topOrigins.length === 0 && (
                      <span className="text-[12px] text-fg-3">—</span>
                    )}
                    {paginatedTopOrigins.map(([origin, total]) => (
                      <Badge key={origin} variant="idle">
                        {origin}: {total}
                      </Badge>
                    ))}
                  </div>
                  {metrics.topOrigins.length > TOP_ORIGINS_PAGE_SIZE && (
                    <div className="flex items-center gap-2 text-[12px] text-fg-3">
                      <span>
                        {safeTopOriginsPage + 1} / {topOriginsPageCount}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={safeTopOriginsPage === 0}
                        onClick={() => setTopOriginsPage((page) => Math.max(0, page - 1))}
                      >
                        Anterior
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={safeTopOriginsPage >= topOriginsPageCount - 1}
                        onClick={() =>
                          setTopOriginsPage((page) => Math.min(topOriginsPageCount - 1, page + 1))
                        }
                      >
                        Siguiente
                      </Button>
                    </div>
                  )}
                </div>
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
                        {dashMetrics?.range.registros ?? 0} {es.projects.visibleRecords} |{' '}
                        {dashMetrics?.range.encuestas ?? 0} {es.projects.surveysCol.toLowerCase()} |{' '}
                        {dashMetrics?.range.grupos ?? 0} {es.projects.groupsCol.toLowerCase()}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <div className="min-w-44">
                        <Label htmlFor="dash-date-from">{es.projects.dateFrom}</Label>
                        <Input
                          id="dash-date-from"
                          type="date"
                          value={dashDateFrom}
                          onChange={(e) => setDashDateFrom(e.target.value)}
                        />
                      </div>
                      <div className="min-w-44">
                        <Label htmlFor="dash-date-to">{es.projects.dateTo}</Label>
                        <Input
                          id="dash-date-to"
                          type="date"
                          value={dashDateTo}
                          onChange={(e) => setDashDateTo(e.target.value)}
                        />
                      </div>
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

                  {detail.loading && (
                    <div className="border border-hair-2 bg-bg-1/80 px-4 py-3 text-[12px] text-fg-3">
                      {es.projects.detailLoading}
                    </div>
                  )}
                  {!detail.loading && detail.error && (
                    <div className="border border-danger/40 bg-danger-bg/30 px-4 py-3 text-[12px] text-danger">
                      {es.projects.detailFailed}
                    </div>
                  )}

                  <MetaGoalMetricsCard
                    state={metaGoalMetrics}
                    configured={
                      !!selectedProject.metaMetricsUrl &&
                      !!selectedProject.metaMetricsSheetId &&
                      selectedProject.metaMetricsSheetIndex !== null
                    }
                  />

                  <PageMetricsCard
                    projectName={selectedProject.nombre}
                    state={pageMetrics}
                    configured={selectedProject.pageMetricsUrls.length > 0}
                  />

                  <VipSalesCard
                    state={vipSales}
                    configured={
                      !!selectedProject.salesProjectCode && !!selectedProject.vipProductId
                    }
                    metrics={vipMetrics}
                  />

                  <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                    <div className="border border-hair-2 bg-bg-1/80 px-4 py-4">
                      <div className="label bracket-label">{es.projects.coverageTitle}</div>
                      <div className="mt-4 text-[42px] font-bold tracking-[-0.04em] text-fg-1">
                        {formatNullablePercent(rangeCoverage)}
                      </div>
                      <p className="mt-2 text-[12px] text-fg-3">{es.projects.coverageHint}</p>
                      <div className="mt-4 border border-hair-1 bg-bg-0/50 px-3 py-3 text-[12px] text-fg-2">
                        {dashMetrics?.range.coveredPhones ?? 0} /{' '}
                        {dashMetrics?.range.uniquePhones ?? 0} teléfonos únicos de registros
                        aparecen en grupos.
                      </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-2">
                      <PieChartCard
                        title={`${es.projects.chartByOrigin}: ${formatOriginBaseLabel(originBaseKey)}`}
                        data={originChartData}
                        total={dashMetrics?.range.registros ?? 0}
                        emptyMessage={es.projects.chartEmpty}
                      />
                      <PieChartCard
                        title={
                          metadataChartKey
                            ? `${es.projects.chartByMetadata}: ${metadataChartKey}`
                            : es.projects.chartByMetadata
                        }
                        data={metadataChartData}
                        total={dashMetrics?.range.registros ?? 0}
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
                          ? '-'
                          : formatScore(scoreMetrics.averageScore)
                      }
                      hint={
                        scoreMetrics.scoredCount > 0
                          ? `${scoreMetrics.scoredCount} ${es.projects.scoredSurveys}`
                          : es.projects.noScoredSurveys
                      }
                    />
                    <OriginScoreCard
                      projectName={selectedProject.nombre}
                      title={`${es.projects.topScoreOriginsTitle}: ${formatOriginBaseLabel(originBaseKey)}`}
                      items={scoreMetrics.topOriginsByScore}
                      emptyMessage={es.projects.noScoredOrigins}
                    />
                  </div>

                  <DailyMetricsChartCard
                    data={dailyMetrics}
                    activeMetric={dailyMetricFilter}
                    onMetricChange={setDailyMetricFilter}
                    originFilter={dailyMetricsOriginFilter}
                    originLabel={formatOriginBaseLabel(dailyOriginBaseKey)}
                    originOptions={dailyMetricsOriginOptions}
                    onOriginFilterChange={setDailyMetricsOriginFilter}
                    originBreakdown={dailyMetricsOriginBreakdown}
                  />

                  <div className="border-t border-hair-1 pt-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="label bracket-label">{es.projects.surveyCoverageTitle}</div>
                        <p className="mt-2 max-w-2xl text-[12px] text-fg-3">
                          {es.projects.surveyCoverageHint}
                        </p>
                        <p className="mt-1 text-[11px] text-fg-3">
                          {visibleSurveyCardKeys.length} / {surveyKeys.length} visibles
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyCardKeys(surveyKeys)}
                        >
                          {es.projects.allCards}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={surveyKeys.length === 0}
                          onClick={() => setVisibleSurveyCardKeys([])}
                        >
                          {es.projects.noCards}
                        </Button>
                      </div>
                    </div>

                    {surveyKeys.length > 0 && (
                      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                        {surveyKeys.map((key) => {
                          const checked = visibleSurveyCardKeys.includes(key);
                          return (
                            <label
                              key={key}
                              htmlFor={`dash-card-${key}`}
                              className="flex items-center gap-2 border border-hair-1 px-3 py-2 text-[12px] text-fg-2"
                            >
                              <Checkbox
                                id={`dash-card-${key}`}
                                checked={checked}
                                onChange={(e) =>
                                  setVisibleSurveyCardKeys((prev) =>
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
                            {recordsPage.data?.total ?? 0} /{' '}
                            {selectedProjectSummary?.registrosCount ?? 0} {es.common.records}
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
                            disabled={!canWriteProjects}
                            onClick={() => setImporting({ target: 'registros' })}
                          >
                            {es.projects.importCsv}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={exporting !== null || (recordsPage.data?.total ?? 0) === 0}
                            onClick={() => void handleExportRegistros()}
                          >
                            {exporting === 'registros'
                              ? es.projects.exportCsvLoading
                              : es.projects.exportCsv}
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        {recordsPage.error || exportError?.view === 'registros' ? (
                          <div className="mb-4 text-[12px] text-danger">
                            {recordsPage.error || exportError?.message}
                          </div>
                        ) : null}
                        <Table
                          columns={registroColumns}
                          rows={filteredRegistros}
                          getRowKey={(row) => String(row.id)}
                          pagination={{
                            mode: 'server',
                            pageIndex: recordsPageIndex,
                            pageSize: recordsPageSize,
                            totalRows: recordsPage.data?.total ?? 0,
                            pageSizeOptions: [10, 25, 50, 100],
                            onPageIndexChange: setRecordsPageIndex,
                            onPageSizeChange: (size) => {
                              setRecordsPageSize(size);
                              setRecordsPageIndex(0);
                            },
                          }}
                          empty={
                            recordsQuery || origenFilter
                              ? es.data.noResults
                              : es.projects.recordsEmpty
                          }
                          actions={
                            canDeleteProjectRows
                              ? (row) => (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="px-2 text-danger hover:bg-danger-bg hover:text-danger"
                                    onClick={() => setDeletingRow({ target: 'registros', row })}
                                    aria-label={`${es.projects.recordDeleteTitle}: ${row.correo}`}
                                    title={es.projects.recordDeleteTitle}
                                  >
                                    X
                                  </Button>
                                )
                              : undefined
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
                        <div>
                          <Label htmlFor="surveys-score-mode">{es.projects.scoreFilter}</Label>
                          <select
                            id="surveys-score-mode"
                            className={SELECT_CLASS_NAME}
                            value={surveysScoreMode}
                            onChange={(e) => {
                              setSurveysScoreMode(e.target.value as EncuestaScoreMode);
                              setSurveysScoreMin('');
                              setSurveysScoreMax('');
                            }}
                          >
                            <option value="all">{es.projects.scoreFilterAll}</option>
                            <option value="gt">{es.projects.scoreFilterGreater}</option>
                            <option value="lt">{es.projects.scoreFilterLess}</option>
                            <option value="between">{es.projects.scoreFilterBetween}</option>
                          </select>
                        </div>
                        {surveysScoreMode === 'gt' || surveysScoreMode === 'between' ? (
                          <div>
                            <Label htmlFor="surveys-score-min">
                              {surveysScoreMode === 'gt'
                                ? es.projects.scoreFilterGreater
                                : es.projects.scoreFrom}
                            </Label>
                            <Input
                              id="surveys-score-min"
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={surveysScoreMin}
                              onChange={(e) => setSurveysScoreMin(e.target.value)}
                            />
                          </div>
                        ) : null}
                        {surveysScoreMode === 'lt' || surveysScoreMode === 'between' ? (
                          <div>
                            <Label htmlFor="surveys-score-max">
                              {surveysScoreMode === 'lt'
                                ? es.projects.scoreFilterLess
                                : es.projects.scoreTo}
                            </Label>
                            <Input
                              id="surveys-score-max"
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={surveysScoreMax}
                              onChange={(e) => setSurveysScoreMax(e.target.value)}
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="border border-hair-2 bg-bg-0/60">
                      <div className="flex items-center justify-between gap-3 border-b border-hair-1 px-4 py-3">
                        <div>
                          <div className="label bracket-label">{es.projects.surveysTitle}</div>
                          <p className="mt-1 text-[12px] text-fg-3">
                            {surveysPage.data?.total ?? 0} /{' '}
                            {selectedProjectSummary?.encuestasCount ?? 0} {es.projects.surveysCol}
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
                            disabled={!canWriteProjects}
                            onClick={() => setImporting({ target: 'encuestas' })}
                          >
                            {es.projects.importCsv}
                          </Button>
                          <Button
                            variant="default"
                            size="sm"
                            disabled={exporting !== null || (surveysPage.data?.total ?? 0) === 0}
                            onClick={() => void handleExportEncuestas()}
                          >
                            {exporting === 'encuestas'
                              ? es.projects.exportCsvLoading
                              : es.projects.exportCsv}
                          </Button>
                        </div>
                      </div>
                      <div className="p-4">
                        {surveysPage.error || exportError?.view === 'encuestas' ? (
                          <div className="mb-4 text-[12px] text-danger">
                            {surveysPage.error || exportError?.message}
                          </div>
                        ) : null}
                        <Table
                          columns={encuestaColumns}
                          rows={filteredEncuestas}
                          getRowKey={(row) => String(row.id)}
                          pagination={{
                            mode: 'server',
                            pageIndex: surveysPageIndex,
                            pageSize: surveysPageSize,
                            totalRows: surveysPage.data?.total ?? 0,
                            pageSizeOptions: [10, 25, 50, 100],
                            onPageIndexChange: setSurveysPageIndex,
                            onPageSizeChange: (size) => {
                              setSurveysPageSize(size);
                              setSurveysPageIndex(0);
                            },
                          }}
                          empty={
                            surveysQuery || surveysScoreMode !== 'all'
                              ? es.data.noResults
                              : es.projects.surveysEmpty
                          }
                          actions={
                            canDeleteProjectRows
                              ? (row) => (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="px-2 text-danger hover:bg-danger-bg hover:text-danger"
                                    onClick={() => setDeletingRow({ target: 'encuestas', row })}
                                    aria-label={`${es.projects.surveyDeleteTitle}: ${row.contactId}`}
                                    title={es.projects.surveyDeleteTitle}
                                  >
                                    X
                                  </Button>
                                )
                              : undefined
                          }
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
                          {groupsPage.data?.total ?? 0} / {selectedProjectSummary?.gruposCount ?? 0}{' '}
                          {es.projects.groupsCol}
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
                          disabled={!canWriteProjects}
                          onClick={() => setImporting({ target: 'grupos' })}
                        >
                          {es.projects.importCsv}
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          disabled={exporting !== null || (groupsPage.data?.total ?? 0) === 0}
                          onClick={() => void handleExportGrupos()}
                        >
                          {exporting === 'grupos'
                            ? es.projects.exportCsvLoading
                            : es.projects.exportCsv}
                        </Button>
                      </div>
                    </div>
                    <div className="p-4">
                      {groupsPage.error || exportError?.view === 'grupos' ? (
                        <div className="mb-4 text-[12px] text-danger">
                          {groupsPage.error || exportError?.message}
                        </div>
                      ) : null}
                      <Table
                        columns={grupoColumns}
                        rows={filteredGrupos}
                        getRowKey={(row) => String(row.id)}
                        pagination={{
                          mode: 'server',
                          pageIndex: groupsPageIndex,
                          pageSize: groupsPageSize,
                          totalRows: groupsPage.data?.total ?? 0,
                          pageSizeOptions: [10, 25, 50, 100],
                          onPageIndexChange: setGroupsPageIndex,
                          onPageSizeChange: (size) => {
                            setGroupsPageSize(size);
                            setGroupsPageIndex(0);
                          },
                        }}
                        empty={groupsQuery ? es.data.noResults : es.projects.groupsEmpty}
                        actions={
                          canDeleteProjectRows
                            ? (row) => (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="px-2 text-danger hover:bg-danger-bg hover:text-danger"
                                  onClick={() => setDeletingRow({ target: 'grupos', row })}
                                  aria-label={`${es.projects.groupDeleteTitle}: ${row.telefono}`}
                                  title={es.projects.groupDeleteTitle}
                                >
                                  X
                                </Button>
                              )
                            : undefined
                        }
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

      {importing && selectedProject && (
        <ProjectCsvImportDialog
          project={selectedProject}
          target={importing.target}
          metadataKeys={metadataKeys}
          surveyKeys={surveyKeys}
          onClose={() => setImporting(null)}
          onImported={refreshProjectData}
        />
      )}
      {deletingRow && selectedProject && (
        <DeleteProjectRowDialog
          deleteState={deletingRow}
          projectId={selectedProject.id}
          onClose={() => setDeletingRow(null)}
          onDeleted={async () => {
            setDeletingRow(null);
            await handleRowDeleted();
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
  const [metaMetricsUrl, setMetaMetricsUrl] = useState(project?.metaMetricsUrl ?? '');
  const [metaMetricsSheetId, setMetaMetricsSheetId] = useState(project?.metaMetricsSheetId ?? '');
  const [metaMetricsSheetIndex, setMetaMetricsSheetIndex] = useState(
    project?.metaMetricsSheetIndex !== null && project?.metaMetricsSheetIndex !== undefined
      ? String(project.metaMetricsSheetIndex)
      : '',
  );
  const [pageMetricsUrlsText, setPageMetricsUrlsText] = useState(
    project?.pageMetricsUrls.join('\n') ?? '',
  );
  const [salesProjectCode, setSalesProjectCode] = useState(project?.salesProjectCode ?? '');
  const [vipProductId, setVipProductId] = useState(project?.vipProductId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit() {
    setBusy(true);
    setError('');
    try {
      const result = isNew
        ? await createProjectEntry({
            data: {
              nombre,
              metaMetricsUrl,
              metaMetricsSheetId,
              metaMetricsSheetIndex,
              pageMetricsUrls: parseUrlsTextarea(pageMetricsUrlsText),
              salesProjectCode,
              vipProductId,
            },
          })
        : await updateProjectEntry({
            data: {
              id: project.id,
              nombre,
              metaMetricsUrl,
              metaMetricsSheetId,
              metaMetricsSheetIndex,
              pageMetricsUrls: parseUrlsTextarea(pageMetricsUrlsText),
              salesProjectCode,
              vipProductId,
            },
          });
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
        <div className="border border-hair-1 bg-bg-0/50 px-3 py-3">
          <div className="label bracket-label">{es.projects.metaMetricsTitle}</div>
          <p className="mt-2 text-[11px] text-fg-3">{es.projects.metaMetricsHint}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <Label htmlFor="project-meta-url">{es.projects.metaMetricsUrlLabel}</Label>
              <Input
                id="project-meta-url"
                value={metaMetricsUrl}
                onChange={(e) => setMetaMetricsUrl(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.metaMetricsUrlHint}</p>
            </div>
            <div>
              <Label htmlFor="project-meta-sheet-id">{es.projects.metaMetricsSheetIdLabel}</Label>
              <Input
                id="project-meta-sheet-id"
                value={metaMetricsSheetId}
                onChange={(e) => setMetaMetricsSheetId(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.metaMetricsSheetIdHint}</p>
            </div>
            <div>
              <Label htmlFor="project-meta-sheet-index">
                {es.projects.metaMetricsSheetIndexLabel}
              </Label>
              <Input
                id="project-meta-sheet-index"
                type="number"
                min="0"
                value={metaMetricsSheetIndex}
                onChange={(e) => setMetaMetricsSheetIndex(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-fg-3">
                {es.projects.metaMetricsSheetIndexHint}
              </p>
            </div>
          </div>
        </div>
        <div className="border border-hair-1 bg-bg-0/50 px-3 py-3">
          <div className="label bracket-label">{es.projects.pageMetricsTitle}</div>
          <p className="mt-2 text-[11px] text-fg-3">{es.projects.pageMetricsHint}</p>
          <div className="mt-4">
            <Label htmlFor="project-page-metrics-urls">{es.projects.pageMetricsUrlsLabel}</Label>
            <textarea
              id="project-page-metrics-urls"
              className="mt-2 min-h-32 w-full rounded-none border border-hair-2 bg-bg-1 px-3 py-2 font-mono text-[13px] text-fg-1 outline-none transition-colors duration-140 ease-achievers focus-visible:border-brand focus-visible:shadow-[0_0_0_2px_rgba(245,158,11,0.18)]"
              value={pageMetricsUrlsText}
              onChange={(e) => setPageMetricsUrlsText(e.target.value)}
            />
            <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.pageMetricsUrlsHint}</p>
          </div>
        </div>
        <div className="border border-hair-1 bg-bg-0/50 px-3 py-3">
          <div className="label bracket-label">{es.projects.vipSalesTitle}</div>
          <p className="mt-2 text-[11px] text-fg-3">{es.projects.vipSalesHint}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="project-sales-code">{es.projects.vipSalesProjectCodeLabel}</Label>
              <Input
                id="project-sales-code"
                value={salesProjectCode}
                onChange={(e) => setSalesProjectCode(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.vipSalesProjectCodeHint}</p>
            </div>
            <div>
              <Label htmlFor="project-vip-product">{es.projects.vipSalesProductIdLabel}</Label>
              <Input
                id="project-vip-product"
                value={vipProductId}
                onChange={(e) => setVipProductId(e.target.value)}
              />
              <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.vipSalesProductIdHint}</p>
            </div>
          </div>
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

function ProjectCsvImportDialog({
  project,
  target,
  metadataKeys,
  surveyKeys,
  onClose,
  onImported,
}: {
  project: ProjectItem;
  target: CsvImportTarget;
  metadataKeys: string[];
  surveyKeys: string[];
  onClose: () => void;
  onImported: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<CsvPreviewData | null>(null);
  const [fileName, setFileName] = useState('');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CsvImportResult | null>(null);

  const options = useMemo(
    () => buildCsvImportOptions(target, metadataKeys, surveyKeys),
    [metadataKeys, surveyKeys, target],
  );

  const optionMap = useMemo(
    () => new Map(options.map((option) => [option.value, option])),
    [options],
  );

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError('');
    setResult(null);

    if (!file) {
      setFileName('');
      setPreview(null);
      setMappings({});
      return;
    }

    try {
      const text = await file.text();
      const nextPreview = parseCsvText(text);
      setFileName(file.name);
      setPreview(nextPreview);
      setMappings(buildInitialCsvMappings(nextPreview.headers, target, metadataKeys, surveyKeys));
    } catch (err) {
      console.error('[projects] csv parse failed', err);
      setFileName(file.name);
      setPreview(null);
      setMappings({});
      setError(es.errors.generic);
    }
  }

  async function onSubmit() {
    if (!preview) {
      setError(es.projects.importEmptyPreview);
      return;
    }

    const selectedValues = Object.values(mappings).filter(
      (value) => value && value !== '__ignore__',
    );
    if (selectedValues.length === 0) {
      setError(es.projects.importNeedMappedColumns);
      return;
    }

    const duplicateCheck = new Set<string>();
    for (const value of selectedValues) {
      if (duplicateCheck.has(value)) {
        setError(es.projects.importDuplicateTargets);
        return;
      }
      duplicateCheck.add(value);
    }

    const payloadMappings = preview.headers.map((header): CsvImportMapping => {
      const selected = mappings[header] ?? '__ignore__';
      const option = optionMap.get(selected);
      if (!option || option.kind === 'ignore') {
        return { sourceKey: header, kind: 'ignore' };
      }

      return { sourceKey: header, kind: option.kind, targetKey: option.targetKey ?? '' };
    });

    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await importProjectCsvRows({
        data: {
          projectId: project.id,
          target,
          mappings: payloadMappings,
          rows: preview.rows,
        },
      });

      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response);
      await onImported();
    } catch (err) {
      console.error('[projects] csv import failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const title =
    target === 'registros'
      ? es.projects.importTitleRegistros
      : target === 'encuestas'
        ? es.projects.importTitleEncuestas
        : es.projects.importTitleGrupos;

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <Label htmlFor="project-csv-file" required>
            {es.projects.importSelectFile}
          </Label>
          <Input id="project-csv-file" type="file" accept=".csv,text/csv" onChange={onFileChange} />
          <p className="mt-1.5 text-[11px] text-fg-3">{es.projects.importSelectFileHint}</p>
          {fileName ? <p className="mt-2 text-[12px] text-fg-2">{fileName}</p> : null}
        </div>

        <div className="border border-hair-2 bg-bg-0/60">
          <div className="flex items-center justify-between gap-3 border-b border-hair-1 px-4 py-3">
            <div>
              <div className="label bracket-label">{es.projects.importPreview}</div>
              <p className="mt-1 text-[12px] text-fg-3">
                {preview
                  ? `${preview.rows.length} ${es.projects.importRowsDetected}`
                  : es.projects.importEmptyPreview}
              </p>
            </div>
            <Badge variant="idle">{project.nombre}</Badge>
          </div>

          {preview ? (
            <div className="max-h-[360px] space-y-3 overflow-auto p-4">
              {preview.headers.map((header) => (
                <div key={header} className="space-y-2 border border-hair-1 bg-bg-1/80 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="label">{es.projects.importColumn}</div>
                      <div className="mt-1 font-mono text-[12px] text-fg-1">{header}</div>
                    </div>
                    <div className="min-w-56">
                      <Label htmlFor={`mapping-${header}`}>{es.projects.importMapTo}</Label>
                      <select
                        id={`mapping-${header}`}
                        className={cn(SELECT_CLASS_NAME, 'mt-2')}
                        value={mappings[header] ?? '__ignore__'}
                        onChange={(e) =>
                          setMappings((prev) => ({
                            ...prev,
                            [header]: e.target.value,
                          }))
                        }
                      >
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="text-[11px] text-fg-3">
                    {preview.rows
                      .slice(0, 3)
                      .map((row) => row[header])
                      .filter(Boolean)
                      .join(' | ') || '-'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-8 text-[12px] text-fg-3">{es.projects.importEmptyPreview}</div>
          )}
        </div>

        {error ? <p className="text-[12px] text-danger">{error}</p> : null}

        {result?.ok ? (
          <div className="space-y-2 border border-hair-2 bg-bg-0/60 px-4 py-4">
            <div className="label bracket-label">{es.projects.importSummary}</div>
            <p className="text-[12px] text-fg-2">
              {result.created} {es.projects.importCreated} · {result.skipped}{' '}
              {es.projects.importSkipped}
            </p>
            <div className="text-[12px] text-fg-3">
              {result.errors.length > 0 ? es.projects.importErrors : es.projects.importNoErrors}
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1 text-[12px] text-danger">
                {result.errors.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
            {es.common.cancel}
          </Button>
          <Button variant="primary" size="sm" disabled={busy} onClick={onSubmit}>
            {busy ? es.projects.importRunning : es.projects.importStart}
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

function DeleteProjectRowDialog({
  deleteState,
  projectId,
  onClose,
  onDeleted,
}: {
  deleteState: ProjectRowDeleteState;
  projectId: number;
  onClose: () => void;
  onDeleted: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onConfirm() {
    setBusy(true);
    setError('');
    try {
      const path =
        deleteState.target === 'registros'
          ? `/api/registros/${deleteState.row.id}?proyectoId=${projectId}`
          : deleteState.target === 'encuestas'
            ? `/api/encuestas/${deleteState.row.id}?proyectoId=${projectId}`
            : `/api/grupos/${deleteState.row.id}?proyectoId=${projectId}`;
      const response = await fetch(path, { method: 'DELETE' });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setError(payload?.error ?? es.errors.generic);
        return;
      }
      await onDeleted();
    } catch (err) {
      console.error('[projects] row delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  const title =
    deleteState.target === 'registros'
      ? es.projects.recordDeleteTitle
      : deleteState.target === 'encuestas'
        ? es.projects.surveyDeleteTitle
        : es.projects.groupDeleteTitle;
  const body =
    deleteState.target === 'registros'
      ? `${es.projects.recordDeleteBody} (${deleteState.row.correo})`
      : deleteState.target === 'encuestas'
        ? `${es.projects.surveyDeleteBody} (${deleteState.row.contactId})`
        : `${es.projects.groupDeleteBody} (${deleteState.row.telefono})`;

  return (
    <ConfirmDialog
      title={title}
      body={body}
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

function VipSalesCard({
  state,
  configured,
  metrics,
}: {
  state: { loading: boolean; result: ProjectVipSalesResult | null };
  configured: boolean;
  metrics: { sales: number; leadsInGroups: number; rate: number | null };
}) {
  const sales = state.result?.status === 'success' ? state.result.sales : null;

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="label bracket-label">{es.projects.vipSalesTitle}</div>
        <p className="mt-1 max-w-2xl text-[12px] text-fg-3">{es.projects.vipSalesHint}</p>
      </div>

      {state.loading ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.common.loading}</div>
      ) : state.result?.status === 'error' ? (
        <div className="px-4 py-8 text-[12px] text-danger">{state.result.message}</div>
      ) : state.result?.status === 'not-configured' || !configured ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.projects.vipSalesNotConfigured}</div>
      ) : !sales ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.projects.vipSalesFetchFailed}</div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2">
            <MetricCard
              label={es.projects.vipSalesCount}
              value={metrics.sales}
              hint={sales.productName ?? undefined}
            />
            <MetricCard
              label={es.projects.vipSalesRate}
              value={formatNullablePercent(metrics.rate)}
              hint={es.projects.vipSalesRateHint
                .replace('{sales}', String(metrics.sales))
                .replace('{leads}', String(metrics.leadsInGroups))}
            />
          </div>
          <p className="text-[11px] text-fg-3">
            {es.projects.vipSalesSourceProject}: [{sales.projectCode}] {sales.projectName}
          </p>
        </div>
      )}
    </div>
  );
}

function MetaGoalMetricsCard({
  state,
  configured,
}: {
  state: { loading: boolean; result: ProjectMetaGoalMetricsResult | null };
  configured: boolean;
}) {
  const metrics = state.result?.status === 'success' ? state.result.metrics : null;
  const costPerLead =
    metrics && metrics.completeRegistrations > 0
      ? formatCurrency(metrics.spend / metrics.completeRegistrations)
      : '—';
  const averagePageSpeed =
    metrics && metrics.linkClicks > 0
      ? formatPercent(metrics.landingPageViews / metrics.linkClicks)
      : '—';
  const averageConversion =
    metrics && metrics.landingPageViews > 0
      ? formatPercent(metrics.leads / metrics.landingPageViews)
      : '—';

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="label bracket-label">{es.projects.metaMetricsTitle}</div>
        <p className="mt-1 max-w-2xl text-[12px] text-fg-3">{es.projects.metaMetricsHint}</p>
      </div>

      {state.loading ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.common.loading}</div>
      ) : state.result?.status === 'error' ? (
        <div className="px-4 py-8 text-[12px] text-danger">{state.result.message}</div>
      ) : state.result?.status === 'not-configured' || !configured ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">
          {es.projects.metaMetricsNotConfigured}
        </div>
      ) : !metrics ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.projects.metaMetricsFetchFailed}</div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard label={es.projects.metaMetricsCostPerLead} value={costPerLead} />
            <MetricCard label={es.projects.metaMetricsAveragePageSpeed} value={averagePageSpeed} />
            <MetricCard
              label={es.projects.metaMetricsAverageConversion}
              value={averageConversion}
            />
            <MetricCard
              label={es.projects.metaMetricsSpend}
              value={formatCurrency(metrics.spend)}
            />
            <MetricCard
              label={es.projects.metaMetricsLinkClicks}
              value={formatInteger(metrics.linkClicks)}
            />
            <MetricCard
              label={es.projects.metaMetricsLandingViews}
              value={formatInteger(metrics.landingPageViews)}
            />
            <MetricCard
              label={es.projects.metaMetricsCompleteRegistrations}
              value={formatInteger(metrics.completeRegistrations)}
            />
            <MetricCard label={es.projects.metaMetricsLeads} value={formatInteger(metrics.leads)} />
            <MetricCard
              label={es.projects.metaMetricsSubscribes}
              value={formatInteger(metrics.subscribes)}
            />
          </div>
          <div className="border border-hair-1 bg-bg-0/40 px-3 py-3 text-[12px] text-fg-2">
            {es.projects.metaMetricsRange}: {metrics.dateStart} → {metrics.dateEnd}
          </div>
        </div>
      )}
    </div>
  );
}

function PageMetricsCard({
  projectName,
  state,
  configured,
}: {
  projectName: string;
  state: { loading: boolean; result: ProjectPageMetricsResult | null };
  configured: boolean;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const items = state.result?.status === 'success' ? state.result.items : [];
  const failures = state.result?.status === 'success' ? state.result.failures : [];
  const totals = items.reduce(
    (acc, item) => ({
      clicks: acc.clicks + item.totals.clicks,
      conversions: acc.conversions + item.totals.conversions,
    }),
    { clicks: 0, conversions: 0 },
  );
  const overallRate = totals.clicks > 0 ? formatPercent(totals.conversions / totals.clicks) : '—';
  const allRows = useMemo<PageMetricsTableRow[]>(() => buildPageMetricsTableRows(items), [items]);
  const filteredRows = useMemo<PageMetricsTableRow[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allRows;

    return allRows.filter((row) =>
      [
        row.adName,
        row.externalKey ?? '',
        row.rotatorTitle,
        row.url,
        row.endpointUrl,
        row.active ? es.common.yes : es.common.no,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [allRows, searchQuery]);
  const tableColumns = useMemo<Column<PageMetricsTableRow>[]>(
    () => [
      {
        key: 'adName',
        header: es.projects.pageMetricsAdName,
        sortValue: (row) => row.scorePromedio ?? Number.NEGATIVE_INFINITY,
        render: (row) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-fg-1">{row.adName}</div>
            <div className="truncate text-[11px] text-fg-3">{row.externalKey ?? '—'}</div>
          </div>
        ),
      },
      {
        key: 'rotator',
        header: es.projects.pageMetricsRotatorName,
        sortValue: (row) => row.rotatorTitle,
        render: (row) => (
          <div className="max-w-52 truncate text-fg-2" title={row.rotatorTitle}>
            {row.rotatorTitle}
          </div>
        ),
      },
      {
        key: 'url',
        header: es.projects.pageMetricsDestinationUrl,
        sortValue: (row) => row.url,
        render: (row) => (
          <div className="max-w-64 truncate text-fg-2" title={row.url || '—'}>
            {row.url || '—'}
          </div>
        ),
      },
      {
        key: 'active',
        header: es.projects.pageMetricsActive,
        sortValue: (row) => (row.active ? 1 : 0),
        render: (row) => (
          <Badge variant={row.active ? 'success' : 'danger'}>{row.active ? 'Si' : 'No'}</Badge>
        ),
      },
      {
        key: 'clicks',
        header: es.projects.pageMetricsTotalClicks,
        align: 'right',
        sortValue: (row) => row.clicks,
        render: (row) => <span className="text-fg-1">{formatInteger(row.clicks)}</span>,
      },
      {
        key: 'conversions',
        header: es.projects.pageMetricsTotalConversions,
        align: 'right',
        sortValue: (row) => row.conversions,
        render: (row) => <span className="text-fg-1">{formatInteger(row.conversions)}</span>,
      },
      {
        key: 'conversionRate',
        header: es.projects.pageMetricsOverallRate,
        align: 'right',
        sortValue: (row) => row.conversionRate,
        render: (row) => (
          <span className="text-fg-1">{formatPercentPrecise(row.conversionRate / 100)}</span>
        ),
      },
      {
        key: 'scorePromedio',
        header: es.projects.pageMetricsScoreAverage,
        align: 'right',
        sortValue: (row) => row.scorePromedio ?? Number.NEGATIVE_INFINITY,
        render: (row) => (
          <span className="font-medium text-fg-1">
            {row.scorePromedio === null ? '—' : formatScore(row.scorePromedio)}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="label bracket-label">{es.projects.pageMetricsTitle}</div>
        <p className="mt-1 max-w-2xl text-[12px] text-fg-3">{es.projects.pageMetricsHint}</p>
      </div>

      {state.loading ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.common.loading}</div>
      ) : state.result?.status === 'error' ? (
        <div className="px-4 py-8 text-[12px] text-danger">{state.result.message}</div>
      ) : state.result?.status === 'not-configured' || !configured ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">
          {es.projects.pageMetricsNotConfigured}
        </div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label={es.projects.pageMetricsRotators} value={items.length} />
            <MetricCard
              label={es.projects.pageMetricsTotalClicks}
              value={formatInteger(totals.clicks)}
            />
            <MetricCard
              label={es.projects.pageMetricsTotalConversions}
              value={formatInteger(totals.conversions)}
            />
            <MetricCard label={es.projects.pageMetricsOverallRate} value={overallRate} />
          </div>

          {failures.length > 0 && (
            <div className="border border-hair-1 bg-bg-0/40 px-3 py-3 text-[12px] text-fg-2">
              {es.projects.pageMetricsPartialWarning}
            </div>
          )}

          <div className="border border-hair-1 bg-bg-0/30">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-hair-1 px-4 py-3">
              <div>
                <div className="label bracket-label">{es.projects.pageMetricsTopAdsTitle}</div>
                <p className="mt-1 text-[12px] text-fg-3">{es.projects.pageMetricsTopAdsHint}</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64 flex-1 sm:max-w-md">
                  <Label htmlFor="page-metrics-search">{es.projects.pageMetricsSearchLabel}</Label>
                  <Input
                    id="page-metrics-search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={es.projects.pageMetricsSearchPlaceholder}
                    className="mt-2"
                  />
                </div>
                <Button
                  type="button"
                  variant="default"
                  onClick={() => exportPageMetricsCsv(projectName, filteredRows)}
                  disabled={filteredRows.length === 0}
                >
                  {es.projects.pageMetricsExportLabel}
                </Button>
              </div>
            </div>
            <div className="px-4 py-3 text-[12px] text-fg-3">
              {es.projects.pageMetricsResultsCount.replace(
                '{count}',
                formatInteger(filteredRows.length),
              )}
            </div>
            <Table
              columns={tableColumns}
              rows={filteredRows}
              getRowKey={(row) => row.id}
              empty={searchQuery ? es.data.noResults : es.common.empty}
              pagination={{ pageSize: 15, pageSizeOptions: [15, 25, 50, 100] }}
            />
          </div>

          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.endpointUrl} className="border border-hair-1 bg-bg-0/40">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair-1 px-4 py-3">
                  <div>
                    <div className="text-[14px] font-semibold text-fg-1">{item.rotator.title}</div>
                    <div className="mt-1 text-[11px] text-fg-3">
                      {es.projects.pageMetricsEndpoint}: {item.endpointUrl}
                    </div>
                    {item.generatedAt && (
                      <div className="mt-1 text-[11px] text-fg-3">
                        {es.projects.pageMetricsGeneratedAt}: {formatDateTime(item.generatedAt)}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <MetricCard
                      label={es.projects.pageMetricsTotalClicks}
                      value={formatInteger(item.totals.clicks)}
                    />
                    <MetricCard
                      label={es.projects.pageMetricsTotalConversions}
                      value={formatInteger(item.totals.conversions)}
                    />
                    <MetricCard
                      label={es.projects.pageMetricsOverallRate}
                      value={formatPercent(item.totals.conversionRate / 100)}
                    />
                  </div>
                </div>

                <div className="space-y-3 px-4 py-4">
                  <div className="text-[12px] text-fg-2">
                    {es.projects.pageMetricsExternalField}: {item.externalMetrics.field ?? '—'}
                  </div>

                  <div className="grid gap-3">
                    {item.destinations.map((destination) => (
                      <div
                        key={`${item.endpointUrl}-${destination.key}`}
                        className="grid gap-3 border border-hair-1 bg-bg-1/60 px-3 py-3 md:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={destination.active ? 'success' : 'danger'}
                              className="shrink-0"
                            >
                              {destination.active ? 'Si' : 'No'}
                            </Badge>
                            <div className="truncate text-[12px] font-medium text-fg-1">
                              {destination.key}
                            </div>
                          </div>
                          <div className="mt-1 truncate text-[11px] text-fg-3">
                            {destination.url || '—'}
                          </div>
                        </div>
                        <MetricMini
                          label={es.projects.pageMetricsTotalClicks}
                          value={formatInteger(destination.clicks)}
                        />
                        <MetricMini
                          label={es.projects.pageMetricsTotalConversions}
                          value={formatInteger(destination.conversions)}
                        />
                        <ConversionRateMini
                          label={es.projects.pageMetricsOverallRate}
                          rate={destination.conversionRate / 100}
                        />
                        <MetricMini
                          label={es.projects.pageMetricsScoreAverage}
                          value={
                            destination.scorePromedio === null
                              ? '—'
                              : formatScore(destination.scorePromedio)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusMini({
  label,
  active,
}: {
  label: string;
  active: boolean;
}) {
  return (
    <div className="border border-hair-1 bg-bg-0/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-3">{label}</div>
      <div className="mt-1">
        <Badge variant={active ? 'success' : 'danger'}>{active ? 'Si' : 'No'}</Badge>
      </div>
    </div>
  );
}

function ConversionRateMini({
  label,
  rate,
}: {
  label: string;
  rate: number;
}) {
  const normalizedRate = Number.isFinite(rate) ? Math.max(0, rate) : 0;
  const barWidth = Math.min(normalizedRate * 100, 100);
  const barClassName = normalizedRate < 20 ? 'bg-warning' : 'bg-success';

  return (
    <div className="border border-hair-1 bg-bg-0/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-3">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-fg-1">{formatPercentPrecise(rate)}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-1">
        <div
          className={cn('h-full rounded-full transition-[width] duration-300', barClassName)}
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
}

function MetricMini({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="border border-hair-1 bg-bg-0/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-[0.12em] text-fg-3">{label}</div>
      <div className="mt-1 text-[14px] font-semibold text-fg-1">{value}</div>
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
  const [page, setPage] = useState(0);
  const chartStyle = buildPieChartStyle(data);
  const PAGE_SIZE = 10;
  const pageCount = Math.max(1, Math.ceil(data.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paginatedData = data.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

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
            {data.length > PAGE_SIZE && (
              <div className="flex items-center justify-end gap-2 text-[12px] text-fg-3">
                <span>
                  {safePage + 1} / {pageCount}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage === 0}
                  onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                >
                  Anterior
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))}
                >
                  Siguiente
                </Button>
              </div>
            )}
            {paginatedData.map((item) => (
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
              {card.answered} / {card.total} {es.projects.answeredLabel}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[24px] font-bold tracking-[-0.03em] text-fg-1">
              {card.values.length}
            </div>
            <div className="text-[11px] text-fg-3">{es.projects.answerOptionsLabel}</div>
          </div>
        </div>
      </div>
      <div className="space-y-2 px-4 py-4">
        {card.values.length === 0 ? (
          <div className="text-[12px] text-fg-3">{es.projects.noAnsweredValues}</div>
        ) : (
          card.values.map((value) => (
            <div key={value.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate text-fg-1">{value.label}</span>
                <span className="shrink-0 text-fg-3">
                  {formatPercent(value.share)} · {value.value}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-bg-0/60">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-300 ease-achievers"
                  style={{ width: `${value.share * 100}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OriginScoreCard({
  projectName,
  title,
  items,
  emptyMessage,
}: {
  projectName: string;
  title: string;
  items: OriginScoreDatum[];
  emptyMessage: string;
}) {
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const PAGE_SIZE = 10;
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => item.label.toLowerCase().includes(q));
  }, [items, searchQuery]);
  const pageCount = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paginatedItems = filteredItems.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  useEffect(() => {
    if (page !== safePage) {
      setPage(safePage);
    }
  }, [page, safePage]);

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="border-b border-hair-1 px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="label bracket-label">{title}</div>
            <p className="mt-1 text-[12px] text-fg-3">{es.projects.averageScoreByOriginHint}</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 sm:max-w-md">
              <Label htmlFor="top-score-origins-search">
                {es.projects.topScoreOriginsSearchLabel}
              </Label>
              <Input
                id="top-score-origins-search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={es.projects.topScoreOriginsSearchPlaceholder}
                className="mt-2"
              />
            </div>
            <Button
              type="button"
              variant="default"
              onClick={() => exportOriginScoreCsv(projectName, filteredItems)}
              disabled={filteredItems.length === 0}
            >
              {es.projects.topScoreOriginsExportLabel}
            </Button>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{emptyMessage}</div>
      ) : (
        <div className="space-y-2 px-4 py-4">
          <div className="text-[12px] text-fg-3">
            {es.projects.topScoreOriginsResultsCount.replace(
              '{count}',
              formatInteger(filteredItems.length),
            )}
          </div>
          {filteredItems.length > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 text-[12px] text-fg-3">
              <span>
                {safePage + 1} / {pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((currentPage) => Math.min(pageCount - 1, currentPage + 1))}
              >
                Siguiente
              </Button>
            </div>
          )}
          {paginatedItems.map((item) => (
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

function DailyMetricsChartCard({
  data,
  activeMetric,
  onMetricChange,
  originFilter,
  originLabel,
  originOptions,
  onOriginFilterChange,
  originBreakdown,
}: {
  data: DailyMetricsPoint[];
  activeMetric: DailyMetricFilter;
  onMetricChange: (value: DailyMetricFilter) => void;
  originFilter: string;
  originLabel: string;
  originOptions: Array<{ value: string; label: string }>;
  onOriginFilterChange: (value: string) => void;
  originBreakdown: DailyMetricsOriginBreakdown[];
}) {
  const [expandedDates, setExpandedDates] = useState<string[]>([]);
  const metricOptions: Array<{ key: DailyMetricFilter; label: string }> = [
    { key: 'all', label: es.projects.allMetricsLabel },
    { key: 'registros', label: es.projects.recordsCol },
    { key: 'encuestas', label: es.projects.surveysCol },
    { key: 'grupos', label: es.projects.groupsCol },
    { key: 'ventasVip', label: es.projects.vipSalesCount },
  ];
  const visibleSeries: DailyMetricSeriesKey[] =
    activeMetric === 'all' ? ['registros', 'encuestas', 'grupos', 'ventasVip'] : [activeMetric];
  const maxValue = Math.max(
    1,
    ...data.flatMap((point) => visibleSeries.map((series) => point[series])),
  );
  const totals = data.reduce(
    (acc, point) => ({
      registros: acc.registros + point.registros,
      encuestas: acc.encuestas + point.encuestas,
      grupos: acc.grupos + point.grupos,
      ventasVip: acc.ventasVip + point.ventasVip,
    }),
    { registros: 0, encuestas: 0, grupos: 0, ventasVip: 0 },
  );
  const originBreakdownByDate = new Map(
    originBreakdown.map((entry) => [entry.dateKey, entry.items]),
  );

  useEffect(() => {
    setExpandedDates((current) =>
      current.filter((dateKey) => (originBreakdownByDate.get(dateKey)?.length ?? 0) > 0),
    );
  }, [originBreakdownByDate]);

  return (
    <div className="border border-hair-2 bg-bg-1/80">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hair-1 px-4 py-3">
        <div>
          <div className="label bracket-label">{es.projects.dailyMetricsTitle}</div>
          <p className="mt-1 max-w-3xl text-[12px] text-fg-3">{es.projects.dailyMetricsHint}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <Label htmlFor="daily-metrics-origin">{originLabel}</Label>
            <select
              id="daily-metrics-origin"
              className={cn(SELECT_CLASS_NAME, 'mt-2')}
              value={originFilter}
              onChange={(e) => onOriginFilterChange(e.target.value)}
            >
              <option value="">{es.projects.allOrigins}</option>
              {originOptions.map((origin) => (
                <option key={origin.value} value={origin.value}>
                  {origin.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {metricOptions.map((option) => (
              <Button
                key={option.key}
                variant={activeMetric === option.key ? 'primary' : 'default'}
                size="sm"
                onClick={() => onMetricChange(option.key)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="px-4 py-8 text-[12px] text-fg-3">{es.projects.dailyMetricsEmpty}</div>
      ) : (
        <div className="space-y-4 px-4 py-4">
          {originFilter && (
            <p className="text-[11px] text-fg-3">{es.projects.vipSalesNoOriginBreakdown}</p>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(['registros', 'encuestas', 'grupos', 'ventasVip'] as const).map((series) => {
              const style = DAILY_METRIC_STYLES[series];
              return (
                <div
                  key={series}
                  className={cn(
                    'border border-hair-1 bg-bg-0/50 px-3 py-3',
                    activeMetric !== 'all' && activeMetric !== series
                      ? 'opacity-50'
                      : style.glowClassName,
                  )}
                >
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-fg-3">
                    <span
                      className="inline-flex size-2.5 rounded-full"
                      style={{ backgroundColor: style.color }}
                    />
                    {formatDailyMetricSeriesLabel(series)}
                  </div>
                  <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-fg-1">
                    {totals[series]}
                  </div>
                  <div className="mt-1 text-[11px] text-fg-3">{es.projects.totalLabel}</div>
                </div>
              );
            })}
          </div>

          <div className="overflow-hidden border border-hair-1 bg-bg-0/50">
            <div className="px-2 py-3 md:px-3">
              <svg
                viewBox="0 0 100 44"
                className="h-60 w-full"
                role="img"
                aria-label={es.projects.dailyMetricsTitle}
                preserveAspectRatio="none"
              >
                {[0, 1, 2, 3, 4].map((step) => {
                  const y = 4 + step * 9;
                  return (
                    <line
                      key={step}
                      x1="0"
                      y1={y}
                      x2="100"
                      y2={y}
                      stroke="rgba(148, 163, 184, 0.18)"
                      strokeWidth="0.4"
                    />
                  );
                })}

                {data.map((point, index) => {
                  const group = buildBarGroupLayout(index, data.length, visibleSeries.length);

                  return (
                    <g key={point.dateKey}>
                      {visibleSeries.map((series, seriesIndex) => {
                        const style = DAILY_METRIC_STYLES[series];
                        const bar = buildBarRect(
                          group,
                          seriesIndex,
                          visibleSeries.length,
                          point[series],
                          maxValue,
                        );

                        return (
                          <rect
                            key={`${series}-${point.dateKey}`}
                            x={bar.x}
                            y={bar.y}
                            width={bar.width}
                            height={bar.height}
                            fill={style.color}
                            opacity={data.length > 45 && index % 2 === 1 ? 0.55 : 0.95}
                          >
                            <title>
                              {`${formatLongDate(point.dateKey)} · ${formatDailyMetricSeriesLabel(series)}: ${point[series]}`}
                            </title>
                          </rect>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>

              <div className="relative mt-2 h-4">
                {buildDailyAxisTicks(data).map((tick) => (
                  <span
                    key={`tick-${tick.dateKey}`}
                    className="absolute -translate-x-1/2 text-[11px] text-fg-3"
                    style={{ left: `${tick.x}%` }}
                    title={buildDailyMetricsTooltip(tick.point)}
                  >
                    {tick.label}
                  </span>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[11px] text-fg-3">
                <span>{es.projects.dayLabel}</span>
                <span>
                  {es.projects.dailyMetricsScaleLabel.replace('{value}', String(maxValue))}
                </span>
                <span>{data.length} días</span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <div className="overflow-hidden border border-hair-1 bg-bg-0/50">
              <div className="max-h-[420px] overflow-auto">
                <div className="grid grid-cols-[110px_repeat(4,minmax(0,1fr))_minmax(110px,1fr)_minmax(110px,1fr)] gap-px bg-hair-1 text-[11px]">
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.dayLabel}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.recordsCol}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.surveysCol}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.groupsCol}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.vipSalesCount}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.surveysVsRecordsLabel}
                  </div>
                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-3">
                    {es.projects.groupsVsSurveysLabel}
                  </div>
                  {data.map((point) => (
                    <Fragment key={point.dateKey}>
                      {(() => {
                        const breakdownItems = originBreakdownByDate.get(point.dateKey) ?? [];
                        const isExpandable =
                          originFilter === DAILY_METRICS_ORGANICO_FILTER &&
                          breakdownItems.length > 0;
                        const isExpanded = expandedDates.includes(point.dateKey);

                        return (
                          <>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-2">
                              {isExpandable ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center justify-between gap-2 text-left"
                                  onClick={() =>
                                    setExpandedDates((current) =>
                                      current.includes(point.dateKey)
                                        ? current.filter((dateKey) => dateKey !== point.dateKey)
                                        : [...current, point.dateKey],
                                    )
                                  }
                                  aria-expanded={isExpanded}
                                >
                                  <span>{point.label}</span>
                                  <span className="text-fg-3">{isExpanded ? '−' : '+'}</span>
                                </button>
                              ) : (
                                point.label
                              )}
                            </div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-1">{point.registros}</div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-1">{point.encuestas}</div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-1">{point.grupos}</div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-1">{point.ventasVip}</div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-2">
                              {formatNullablePercent(point.encuestasVsRegistros)}
                            </div>
                            <div className="bg-bg-0/70 px-3 py-2 text-fg-2">
                              {formatNullablePercent(point.gruposVsEncuestas)}
                            </div>
                            {isExpandable && isExpanded && (
                              <div className="col-span-7 bg-bg-0/40 px-0 py-0">
                                <div className="grid grid-cols-[110px_repeat(4,minmax(0,1fr))_minmax(110px,1fr)_minmax(110px,1fr)] gap-px bg-hair-1 text-[11px]">
                                  {breakdownItems.map((item) => (
                                    <Fragment key={`${point.dateKey}-${item.origin}`}>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-2">
                                        {item.origin}
                                      </div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-1">
                                        {item.registros}
                                      </div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-1">
                                        {item.encuestas}
                                      </div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-1">
                                        {item.grupos}
                                      </div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-3">—</div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-2">
                                        {formatNullablePercent(
                                          item.registros > 0
                                            ? item.encuestas / item.registros
                                            : null,
                                        )}
                                      </div>
                                      <div className="bg-bg-1/70 px-3 py-2 text-fg-2">
                                        {formatNullablePercent(
                                          item.encuestas > 0 ? item.grupos / item.encuestas : null,
                                        )}
                                      </div>
                                    </Fragment>
                                  ))}
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-1">
                                    total
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-1">
                                    {point.registros}
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-1">
                                    {point.encuestas}
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-1">
                                    {point.grupos}
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-1">
                                    {point.ventasVip}
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-2">
                                    {formatNullablePercent(point.encuestasVsRegistros)}
                                  </div>
                                  <div className="bg-bg-1 px-3 py-2 font-medium text-fg-2">
                                    {formatNullablePercent(point.gruposVsEncuestas)}
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="border border-hair-1 bg-bg-0/50 px-4 py-3">
                <div className="label bracket-label">{es.projects.dailyConversionTitle}</div>
                <p className="mt-2 text-[12px] text-fg-3">{es.projects.dailyConversionHint}</p>
              </div>

              {data
                .slice()
                .reverse()
                .slice(0, 7)
                .map((point) => (
                  <div
                    key={`summary-${point.dateKey}`}
                    className="border border-hair-1 bg-bg-0/40 px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[12px] font-medium text-fg-1">{point.label}</div>
                      <div className="text-[11px] text-fg-3">
                        {point.registros} / {point.encuestas} / {point.grupos} / {point.ventasVip}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="border border-hair-1 bg-bg-1/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-fg-3">
                          {es.projects.surveysVsRecordsLabel}
                        </div>
                        <div className="mt-1 text-[18px] font-bold text-fg-1">
                          {formatNullablePercent(point.encuestasVsRegistros)}
                        </div>
                      </div>
                      <div className="border border-hair-1 bg-bg-1/70 px-3 py-2">
                        <div className="text-[10px] uppercase tracking-[0.16em] text-fg-3">
                          {es.projects.groupsVsSurveysLabel}
                        </div>
                        <div className="mt-1 text-[18px] font-bold text-fg-1">
                          {formatNullablePercent(point.gruposVsEncuestas)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
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

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseUrlsTextarea(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function formatInteger(value: number) {
  return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(value);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function buildSurveyLeadSortValue(
  row: EncuestaRow,
  registrosById: Map<string, SurveyLeadLookupRow>,
) {
  const lead = registrosById.get(row.contactId);
  if (!lead) return row.contactId;
  return [lead.nombre, lead.correo, lead.telefono ?? '', lead.origen]
    .join(' ')
    .trim()
    .toLowerCase();
}

function renderSurveyLeadCell(row: EncuestaRow, registrosById: Map<string, SurveyLeadLookupRow>) {
  const lead = registrosById.get(row.contactId);
  if (!lead) {
    return <span className="text-fg-1">{row.contactId}</span>;
  }

  return (
    <div className="min-w-[220px]">
      <div className="text-fg-1">{lead.nombre}</div>
      <div className="text-fg-3">{lead.correo}</div>
      <div className="text-fg-3">{lead.telefono ?? '-'}</div>
    </div>
  );
}

function isPlainObject(value: JsonValue | unknown): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function collectJsonKeys(values: (JsonValue | unknown)[]) {
  const keys = new Set<string>();

  for (const value of values) {
    if (!isPlainObject(value)) continue;
    for (const key of Object.keys(value)) keys.add(key);
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

function readSurveyAnswer(row: EncuestaRow, key: string) {
  return isPlainObject(row.respuestas) ? row.respuestas[key] : undefined;
}

function formatOriginBaseLabel(key: string) {
  if (key === '__origen__') return es.projects.originBaseDefault;
  return key;
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

function buildDailyMetricsTimeline(
  points: Array<{ dateKey: string; registros: number; encuestas: number; grupos: number }>,
  ventasVipByDay: Map<string, number>,
): DailyMetricsPoint[] {
  const byDay = new Map(points.map((point) => [point.dateKey, point] as const));
  // Day keys already arrive as YYYY-MM-DD, so they are used as is instead of
  // being re-parsed into a timezone-dependent Date.
  const orderedKeys = Array.from(new Set([...byDay.keys(), ...ventasVipByDay.keys()])).sort(
    (a, b) => a.localeCompare(b),
  );

  if (orderedKeys.length === 0) return [];
  const firstKey = orderedKeys[0];
  const lastKey = orderedKeys.at(-1);
  if (!firstKey || !lastKey) return [];

  const timeline: DailyMetricsPoint[] = [];
  let cursor = parseDateKey(firstKey);
  const end = parseDateKey(lastKey);

  while (cursor.getTime() <= end.getTime()) {
    const dateKey = toDateKey(cursor);
    const counters = byDay.get(dateKey);
    const registrosCount = counters?.registros ?? 0;
    const encuestasCount = counters?.encuestas ?? 0;
    const gruposCount = counters?.grupos ?? 0;

    timeline.push({
      dateKey,
      label: formatShortDate(dateKey),
      registros: registrosCount,
      encuestas: encuestasCount,
      grupos: gruposCount,
      ventasVip: ventasVipByDay.get(dateKey) ?? 0,
      encuestasVsRegistros: registrosCount > 0 ? encuestasCount / registrosCount : null,
      gruposVsEncuestas: encuestasCount > 0 ? gruposCount / encuestasCount : null,
    });

    cursor = addDays(cursor, 1);
  }

  return timeline;
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

function buildBarGroupLayout(index: number, total: number, seriesCount: number) {
  const left = 2;
  const right = 98;
  const fullWidth = right - left;
  const groupWidth = total <= 0 ? fullWidth : fullWidth / total;
  const targetInnerWidth = Math.max(
    1.4,
    Math.min(groupWidth * 0.5, seriesCount * 1.45 + Math.max(0, seriesCount - 1) * 0.18),
  );
  const innerWidth = Math.max(0.18, Math.min(groupWidth - 0.25, targetInnerWidth));
  const groupX = left + index * groupWidth + (groupWidth - innerWidth) / 2;
  return { groupX, innerWidth, seriesCount };
}

function buildBarRect(
  group: { groupX: number; innerWidth: number; seriesCount: number },
  seriesIndex: number,
  visibleSeriesCount: number,
  value: number,
  maxValue: number,
) {
  const top = 4;
  const bottom = 40;
  const usableHeight = bottom - top;
  const barGap = visibleSeriesCount > 1 ? 0.18 : 0;
  const width =
    visibleSeriesCount <= 0
      ? group.innerWidth
      : Math.max(
          0.18,
          (group.innerWidth - barGap * Math.max(0, visibleSeriesCount - 1)) / visibleSeriesCount,
        );
  const height = Math.max(0.4, (value / Math.max(1, maxValue)) * usableHeight);
  const x = group.groupX + seriesIndex * (width + barGap);
  const y = bottom - height;
  return { x, y, width, height };
}

function buildDailyAxisTicks(data: DailyMetricsPoint[]) {
  if (data.length === 0) return [];

  const maxTicks = Math.min(6, data.length);
  const step = Math.max(1, Math.ceil((data.length - 1) / Math.max(1, maxTicks - 1)));
  const ticks: Array<{ dateKey: string; label: string; x: number; point: DailyMetricsPoint }> = [];

  for (let index = 0; index < data.length; index += step) {
    const point = data[index];
    if (!point) continue;
    const group = buildBarGroupLayout(index, data.length, 1);
    ticks.push({
      dateKey: point.dateKey,
      label: point.label,
      x: group.groupX + group.innerWidth / 2,
      point,
    });
  }

  const lastPoint = data.at(-1);
  if (lastPoint) {
    const hasLastTick = ticks.some((tick) => tick.dateKey === lastPoint.dateKey);
    if (!hasLastTick) {
      const lastIndex = data.length - 1;
      const group = buildBarGroupLayout(lastIndex, data.length, 1);
      ticks.push({
        dateKey: lastPoint.dateKey,
        label: lastPoint.label,
        x: group.groupX + group.innerWidth / 2,
        point: lastPoint,
      });
    }
  }

  return ticks;
}

function buildDailyMetricsTooltip(point: DailyMetricsPoint) {
  return [
    formatLongDate(point.dateKey),
    `${es.projects.recordsCol}: ${point.registros}`,
    `${es.projects.surveysCol}: ${point.encuestas}`,
    `${es.projects.groupsCol}: ${point.grupos}`,
    `${es.projects.vipSalesCount}: ${point.ventasVip}`,
    `${es.projects.surveysVsRecordsLabel}: ${formatNullablePercent(point.encuestasVsRegistros)}`,
    `${es.projects.groupsVsSurveysLabel}: ${formatNullablePercent(point.gruposVsEncuestas)}`,
  ].join('\n');
}

function formatPercent(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatPercentPrecise(value: number) {
  return new Intl.NumberFormat('es-ES', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNullablePercent(value: number | null) {
  return value === null ? '—' : formatPercent(value);
}

function formatScore(value: number) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 2,
  }).format(value);
}

function countRowsByDay<T>(rows: T[], getDate: (row: T) => string | Date) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const dateKey = toDateKey(getDate(row));
    counts.set(dateKey, (counts.get(dateKey) ?? 0) + 1);
  }

  return counts;
}

function toDateKey(value: string | Date) {
  const parsed = typeof value === 'string' ? new Date(value) : value;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value: string) {
  const [yearPart, monthPart, dayPart] = value.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  return new Date(year, month - 1, day);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
  }).format(parseDateKey(value));
}

function formatLongDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parseDateKey(value));
}

function formatDailyMetricSeriesLabel(series: DailyMetricSeriesKey) {
  switch (series) {
    case 'registros':
      return es.projects.recordsCol;
    case 'encuestas':
      return es.projects.surveysCol;
    case 'grupos':
      return es.projects.groupsCol;
    case 'ventasVip':
      return es.projects.vipSalesCount;
  }
}

// The column-visibility effects below run on every new `metadataKeys` /
// `surveyKeys` identity, so they must never store an equal-but-new array: that
// is what turned a data reload into an endless render loop.
function sameKeys(left: string[], right: string[]) {
  return left.length === right.length && left.every((key, index) => key === right[index]);
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

function buildRegistroSearchText(row: RegistroRow) {
  const metadataText = isPlainObject(row.metadata)
    ? Object.values(row.metadata)
        .map((value) => formatMetadataValue(value))
        .join(' ')
    : '';

  return [row.nombre, row.correo, row.telefono ?? '', row.origen, metadataText].join(' ');
}

function buildEncuestaSearchText(row: EncuestaRow) {
  const respuestasText = isPlainObject(row.respuestas)
    ? Object.entries(row.respuestas)
        .map(([key, value]) => `${key} ${formatMetadataValue(value)}`)
        .join(' ')
    : formatMetadataValue(row.respuestas);

  return [row.contactId, row.score === null ? '' : String(row.score), respuestasText].join(' ');
}

function buildGrupoSearchText(row: GrupoRow) {
  return [row.telefono, row.campana, row.grupo, formatDateTime(row.fecha)].join(' ');
}

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
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

function exportEncuestasCsv(
  projectName: string,
  rows: EncuestaRow[],
  contactos: SurveyLeadLookupRow[],
  metadataKeys: string[],
  visibleSurveyKeys: string[],
) {
  if (typeof document === 'undefined' || rows.length === 0) return;

  const registrosById = new Map(contactos.map((row) => [String(row.id), row] as const));
  const contactHeaders = [
    'Contacto creado',
    'Contacto nombre',
    'Contacto correo',
    'Contacto telefono',
    'Contacto origen',
    ...metadataKeys.map((key) => `Contacto ${key}`),
  ];

  const csvRows = [
    [
      es.projects.createdCol,
      es.projects.surveyContactCol,
      es.projects.surveyScoreCol,
      ...contactHeaders,
      ...visibleSurveyKeys,
    ],
    ...rows.map((row) => {
      const contacto = registrosById.get(row.contactId);
      return [
        formatDateTime(row.createdAt),
        row.contactId,
        row.score === null ? '' : String(row.score),
        contacto ? formatDateTime(contacto.createdAt) : '',
        contacto?.nombre ?? '',
        contacto?.correo ?? '',
        contacto?.telefono ?? '',
        contacto?.origen ?? '',
        ...metadataKeys.map((key) =>
          contacto && isPlainObject(contacto.metadata)
            ? formatMetadataValue(contacto.metadata[key])
            : '',
        ),
        ...visibleSurveyKeys.map((key) => formatMetadataValue(readSurveyAnswer(row, key))),
      ];
    }),
  ];

  downloadCsv(`encuestas-${projectName}`, csvRows);
}

function exportPageMetricsCsv(projectName: string, rows: PageMetricsTableRow[]) {
  if (typeof document === 'undefined' || rows.length === 0) return;

  const csvRows = [
    [
      es.projects.pageMetricsAdName,
      es.projects.pageMetricsExternalField,
      es.projects.pageMetricsRotatorName,
      es.projects.pageMetricsEndpoint,
      es.projects.pageMetricsDestinationUrl,
      es.projects.pageMetricsActive,
      es.projects.pageMetricsTotalClicks,
      es.projects.pageMetricsTotalConversions,
      es.projects.pageMetricsOverallRate,
      es.projects.pageMetricsScoreAverage,
    ],
    ...rows.map((row) => [
      row.adName,
      row.externalKey ?? '',
      row.rotatorTitle,
      row.endpointUrl,
      row.url,
      row.active ? es.common.yes : es.common.no,
      String(row.clicks),
      String(row.conversions),
      formatPercentPrecise(row.conversionRate / 100),
      row.scorePromedio === null ? '' : formatScore(row.scorePromedio),
    ]),
  ];

  downloadCsv(`anuncios-score-${projectName}`, csvRows);
}

function exportOriginScoreCsv(projectName: string, items: OriginScoreDatum[]) {
  if (typeof document === 'undefined' || items.length === 0) return;

  const csvRows = [
    [
      es.projects.topScoreOriginsItemLabel,
      es.projects.pageMetricsScoreAverage,
      es.projects.scoredSurveys,
    ],
    ...items.map((item) => [item.label, formatScore(item.average), String(item.count)]),
  ];

  downloadCsv(`anuncios-score-origenes-${projectName}`, csvRows);
}

function buildCsvImportOptions(
  target: CsvImportTarget,
  metadataKeys: string[],
  surveyKeys: string[],
): CsvImportOption[] {
  const options: CsvImportOption[] = [
    { value: '__ignore__', label: es.projects.importIgnore, kind: 'ignore' },
  ];

  if (target === 'registros') {
    options.push(
      {
        value: 'field:nombre',
        label: es.projects.importRegistrosFieldNombre,
        kind: 'field',
        targetKey: 'nombre',
      },
      {
        value: 'field:correo',
        label: es.projects.importRegistrosFieldCorreo,
        kind: 'field',
        targetKey: 'correo',
      },
      {
        value: 'field:telefono',
        label: es.projects.importRegistrosFieldTelefono,
        kind: 'field',
        targetKey: 'telefono',
      },
      {
        value: 'field:origen',
        label: es.projects.importRegistrosFieldOrigen,
        kind: 'field',
        targetKey: 'origen',
      },
      ...metadataKeys.map((key) => ({
        value: `metadata:${key}`,
        label: `${es.projects.importMetadataExisting}: ${key}`,
        kind: 'metadata' as const,
        targetKey: key,
      })),
    );
  }

  if (target === 'encuestas') {
    options.push(
      {
        value: 'field:contactId',
        label: es.projects.importEncuestasFieldContactId,
        kind: 'field',
        targetKey: 'contactId',
      },
      {
        value: 'field:correo',
        label: es.projects.importEncuestasFieldCorreo,
        kind: 'field',
        targetKey: 'correo',
      },
      {
        value: 'field:score',
        label: es.projects.importEncuestasFieldScore,
        kind: 'field',
        targetKey: 'score',
      },
      ...surveyKeys.map((key) => ({
        value: `respuesta:${key}`,
        label: `${es.projects.importSurveyExisting}: ${key}`,
        kind: 'respuesta' as const,
        targetKey: key,
      })),
    );
  }

  if (target === 'grupos') {
    options.push(
      {
        value: 'field:telefono',
        label: es.projects.importGruposFieldTelefono,
        kind: 'field',
        targetKey: 'telefono',
      },
      {
        value: 'field:campana',
        label: es.projects.importGruposFieldCampana,
        kind: 'field',
        targetKey: 'campana',
      },
      {
        value: 'field:grupo',
        label: es.projects.importGruposFieldGrupo,
        kind: 'field',
        targetKey: 'grupo',
      },
      {
        value: 'field:fecha',
        label: es.projects.importGruposFieldFecha,
        kind: 'field',
        targetKey: 'fecha',
      },
    );
  }

  return options;
}

function buildInitialCsvMappings(
  headers: string[],
  target: CsvImportTarget,
  metadataKeys: string[],
  surveyKeys: string[],
) {
  const mappings: Record<string, string> = {};
  const options = buildCsvImportOptions(target, metadataKeys, surveyKeys);
  const optionValues = new Set(options.map((option) => option.value));

  for (const header of headers) {
    const guess = guessCsvMapping(header, target, metadataKeys, surveyKeys);
    mappings[header] = guess && optionValues.has(guess) ? guess : '__ignore__';
  }

  return mappings;
}

function guessCsvMapping(
  header: string,
  target: CsvImportTarget,
  metadataKeys: string[],
  surveyKeys: string[],
) {
  const normalized = normalizeCsvHeader(header);

  if (target === 'registros') {
    if (matchesHeader(normalized, ['nombre', 'name'])) return 'field:nombre';
    if (matchesHeader(normalized, ['correo', 'email', 'mail'])) return 'field:correo';
    if (matchesHeader(normalized, ['telefono', 'phone', 'movil', 'celular'])) {
      return 'field:telefono';
    }
    if (matchesHeader(normalized, ['origen', 'utmcontent', 'source', 'fuente'])) {
      return 'field:origen';
    }

    const metadataMatch = metadataKeys.find((key) => normalizeCsvHeader(key) === normalized);
    if (metadataMatch) return `metadata:${metadataMatch}`;
  }

  if (target === 'encuestas') {
    if (matchesHeader(normalized, ['contactid', 'contactoid', 'contact_id'])) {
      return 'field:contactId';
    }
    if (matchesHeader(normalized, ['correo', 'email', 'mail'])) return 'field:correo';
    if (matchesHeader(normalized, ['score', 'puntuacion', 'nota'])) return 'field:score';

    const answerMatch = surveyKeys.find((key) => normalizeCsvHeader(key) === normalized);
    if (answerMatch) return `respuesta:${answerMatch}`;
  }

  if (target === 'grupos') {
    if (matchesHeader(normalized, ['telefono', 'phone', 'movil', 'celular'])) {
      return 'field:telefono';
    }
    if (matchesHeader(normalized, ['campana', 'campaign', 'campaignname'])) {
      return 'field:campana';
    }
    if (matchesHeader(normalized, ['grupo', 'group', 'groupname'])) return 'field:grupo';
    if (matchesHeader(normalized, ['fecha', 'date', 'createdat'])) return 'field:fecha';
  }

  return null;
}

function matchesHeader(value: string, aliases: string[]) {
  return aliases.some((alias) => value === normalizeCsvHeader(alias));
}

function normalizeCsvHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replaceAll(/\p{M}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

function parseCsvText(text: string): CsvPreviewData {
  const rows = parseCsvMatrix(text);
  if (rows.length === 0) return { headers: [], rows: [] };

  const rawHeaders = rows[0];
  if (!rawHeaders) return { headers: [], rows: [] };
  const body = rows.slice(1);
  const headers = rawHeaders.map((header, index) => {
    const trimmed = header.trim();
    return trimmed || `columna_${index + 1}`;
  });

  const normalizedRows = body
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, (row[index] ?? '').trim()])),
    )
    .filter((row) => Object.values(row).some((value) => value.length > 0));

  return { headers, rows: normalizedRows };
}

function parseCsvMatrix(text: string) {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      currentRow.push(currentCell);
      rows.push(currentRow);
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  return rows;
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

function buildPageMetricsTableRows(items: ProjectPageMetricsItem[]) {
  return items
    .flatMap((item) =>
      item.destinations.map((destination) => ({
        id: `${item.endpointUrl}-${destination.key}`,
        endpointUrl: item.endpointUrl,
        rotatorTitle: item.rotator.title,
        adName: destination.key,
        externalKey: destination.externalKey,
        url: destination.url,
        active: destination.active,
        clicks: destination.clicks,
        conversions: destination.conversions,
        conversionRate: destination.conversionRate,
        scorePromedio: destination.scorePromedio,
      })),
    )
    .sort((a, b) => {
      const scoreDiff =
        (b.scorePromedio ?? Number.NEGATIVE_INFINITY) -
        (a.scorePromedio ?? Number.NEGATIVE_INFINITY);
      if (scoreDiff !== 0) return scoreDiff;
      if (b.conversions !== a.conversions) return b.conversions - a.conversions;
      if (b.clicks !== a.clicks) return b.clicks - a.clicks;
      return a.adName.localeCompare(b.adName);
    });
}

function metadataCookieName(projectId: number) {
  return `achievers_project_meta_cols_${projectId}`;
}

function surveyColumnsCookieName(projectId: number) {
  return `achievers_project_survey_cols_${projectId}`;
}

function surveyCardsCookieName(projectId: number) {
  return `achievers_project_survey_cards_${projectId}`;
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

function readSurveyCardsCookie(projectId: number) {
  if (typeof document === 'undefined') return null;
  const prefix = `${surveyCardsCookieName(projectId)}=`;
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

function writeSurveyCardsCookie(projectId: number, columns: string[]) {
  if (typeof document === 'undefined') return;
  document.cookie = `${surveyCardsCookieName(projectId)}=${encodeURIComponent(
    JSON.stringify(columns),
  )}; path=/; max-age=31536000; samesite=lax`;
}

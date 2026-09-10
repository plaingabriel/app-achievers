import { db } from '@/db/index';
import {
  acsVentaDiaria,
  encuesta,
  grupo,
  metricaHistorica,
  project,
  registro,
  userProjectAccess,
} from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { type SQL, and, count, desc, eq, gt, gte, inArray, lte, max, sql } from 'drizzle-orm';
import { env } from './env';
import {
  type GrupoEvento,
  ORIGIN_BASE_DEFAULT_KEY,
  type ProjectDashMetrics,
  createDashAggregator,
} from './projects-dash-aggregates';
import {
  assertPermission,
  assertProjectPermission,
  logServerError,
  recordAudit,
} from './server-rbac';
import type { MutationResult } from './server-rbac';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ProjectItem = {
  id: number;
  nombre: string;
  metaMetricsUrl: string | null;
  metaMetricsSheetId: string | null;
  metaMetricsSheetIndex: number | null;
  pageMetricsUrls: string[];
  salesProjectCode: string | null;
  vipProductId: string | null;
  salesEditionId: string | null;
  createdAt: string;
};

export type ProjectSummary = ProjectItem & {
  registrosCount: number;
  encuestasCount: number;
  /** Entries into WhatsApp groups. Not membership — see `gruposParticipantesCount`. */
  gruposCount: number;
  gruposSalidasCount: number;
  /** Live assignments: `(telefono, grupo)` pairs whose entries exceed their exits. */
  gruposParticipantesCount: number;
  latestRegistroAt: string | null;
  latestEncuestaAt: string | null;
  latestGrupoAt: string | null;
};

export type RegistroItem = {
  id: number;
  proyectoId: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  metadata: JsonValue;
  origen: string;
  createdAt: string;
};

export type GrupoItem = {
  id: number;
  proyectoId: number;
  telefono: string;
  campana: string;
  grupo: string;
  /** Entry or exit. The table has to show it, or the two are indistinguishable. */
  evento: GrupoEvento;
  fecha: string;
  createdAt: string;
};

export type EncuestaItem = {
  id: number;
  proyectoId: number;
  contactId: string;
  respuestas: JsonValue;
  score: number | null;
  createdAt: string;
};

export type ProjectsOverview = {
  projects: ProjectSummary[];
};

export type ProjectRowsPage<T> = {
  rows: T[];
  total: number;
  pageIndex: number;
  pageSize: number;
};

export type ProjectRegistrosPage = ProjectRowsPage<RegistroItem> & {
  metadataKeys: string[];
  origins: string[];
};

export type ProjectEncuestaContact = Pick<
  RegistroItem,
  'id' | 'nombre' | 'correo' | 'telefono' | 'origen' | 'metadata' | 'createdAt'
>;

export type ProjectEncuestasPage = ProjectRowsPage<EncuestaItem> & {
  surveyKeys: string[];
  contactos: ProjectEncuestaContact[];
};

export type ProjectGruposPage = ProjectRowsPage<GrupoItem>;

export type ProjectRegistrosExport = {
  rows: RegistroItem[];
};

export type EncuestaScoreMode = 'all' | 'gt' | 'lt' | 'between';

export type ProjectGruposExport = {
  rows: GrupoItem[];
};

export type ProjectMetaGoalMetrics = {
  dateStart: string;
  dateEnd: string;
  spend: number;
  linkClicks: number;
  landingPageViews: number;
  completeRegistrations: number;
  leads: number;
  subscribes: number;
};

export type ProjectMetaGoalMetricsResult =
  | { status: 'success'; metrics: ProjectMetaGoalMetrics }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

export type ProjectPageMetricsDestination = {
  key: string;
  externalKey: string | null;
  url: string;
  weight: number;
  active: boolean;
  clicks: number;
  conversions: number;
  conversionRate: number;
  scorePromedio: number | null;
};

export type ProjectPageMetricsItem = {
  endpointUrl: string;
  generatedAt: string | null;
  rotator: {
    id: number;
    title: string;
    slug: string;
    url: string;
  };
  totals: {
    clicks: number;
    conversions: number;
    conversionRate: number;
  };
  destinations: ProjectPageMetricsDestination[];
  externalMetrics: {
    ok: boolean;
    field: string | null;
    error: string | null;
  };
};

export type ProjectPageMetricsResult =
  | {
      status: 'success';
      items: ProjectPageMetricsItem[];
      failures: Array<{ endpointUrl: string; message: string }>;
    }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

export type { ProjectDashMetrics } from './projects-dash-aggregates';

// VIP access sales for a project, read from `achievers-comercial-system` through
// its `public-project-metrics` Edge Function. That system already knows which
// project each sale belongs to, so the dashboard only maps project + product.
export type ProjectVipSalesDay = {
  fechaKey: string;
  count: number;
};

export type ProjectVipSales = {
  projectCode: string;
  projectName: string;
  // `ediciones.id` sent as `edicionId`, and whether the sales system actually
  // filtered by it. It answers `meta.filters.edicionId` with what it honoured,
  // so an endpoint that does not know the parameter yet is visible instead of
  // silently reporting the whole modalidad. See docs/ventas-vip.md.
  editionId: string | null;
  editionFilterApplied: boolean;
  productId: string;
  productName: string | null;
  dateStart: string;
  dateEnd: string;
  count: number;
  daily: ProjectVipSalesDay[];
  // Unique phones in `grupos` for the same range: the denominator of the ratio.
  // Computed in SQL so the card does not depend on the project detail payload.
  leadsInGroups: number;
};

export type ProjectVipSalesResult =
  | { status: 'success'; sales: ProjectVipSales }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

export type CsvImportTarget = 'registros' | 'encuestas' | 'grupos';
export type CsvImportMapping =
  | { sourceKey: string; kind: 'ignore' }
  | { sourceKey: string; kind: 'field'; targetKey: string }
  | { sourceKey: string; kind: 'metadata'; targetKey: string }
  | { sourceKey: string; kind: 'respuesta'; targetKey: string };

export type CsvImportResult =
  | { ok: true; created: number; skipped: number; errors: string[] }
  | { ok: false; error: string };

type ProjectMutationResult = { ok: true; project: ProjectItem } | { ok: false; error: string };

// Hand-typed totals for a launch that predates the dashboard (ADR 0015). Every
// metric is nullable because `null` ("nobody has this figure") and `0`
// ("measured, and it was zero") are different answers and the dash shows them
// differently. The spend fields are strings: they are DECIMAL columns, and
// parsing them into a float here would reintroduce the drift the column type
// exists to avoid.
export type HistoricalMetricsItem = {
  proyectoId: number;
  desde: string;
  hasta: string;
  registros: number | null;
  encuestas: number | null;
  grupos: number | null;
  vip: number | null;
  organicos: number | null;
  leadsApi: number | null;
  inversionMeta: string | null;
  inversionGoogle: string | null;
  inversionTiktok: string | null;
  picoCpl1: number | null;
  picoCpl2: number | null;
  picoCpl3: number | null;
  picoCpl4: number | null;
  fuente: string;
  notas: string | null;
  updatedAt: string;
};

type HistoricalMutationResult =
  | { ok: true; historical: HistoricalMetricsItem | null }
  | { ok: false; error: string };

/** The dash payload plus the project's declared history, when it has one. */
export type ProjectDashPayload = ProjectDashMetrics & {
  historical: HistoricalMetricsItem | null;
};

type DeleteProjectResult = MutationResult & { deletedId?: number };

function canAccessProject(
  access: { isAdmin: boolean; projectIds: Set<number> | null },
  projectId: number,
) {
  return access.isAdmin || access.projectIds?.has(projectId) === true;
}

async function resolveProjectAccess(userId: string) {
  const { resolveAccess } = await import('./rbac');
  return resolveAccess(userId);
}

function normalizeNombre(nombre: string) {
  return nombre.trim();
}

function normalizeMetaMetricsSheetId(value: string | undefined) {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeMetaMetricsUrl(value: string | undefined) {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function normalizePageMetricsUrls(values: string[] | undefined) {
  if (!values) return { urls: [] as string[], invalid: false };

  const urls: string[] = [];
  for (const rawValue of values) {
    const trimmed = rawValue.trim();
    if (!trimmed) continue;
    try {
      urls.push(new URL(trimmed).toString());
    } catch {
      return { urls: [] as string[], invalid: true };
    }
  }

  return { urls: Array.from(new Set(urls)), invalid: false };
}

function readPageMetricsUrls(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function normalizeMetaMetricsSheetIndex(value: number | string | undefined) {
  if (value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeNullableString(value: string | undefined) {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readMappedRowValue(row: Record<string, string>, sourceKey: string) {
  return normalizeNullableString(row[sourceKey]);
}

function parseImportDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function findLatestRegistroByProjectAndCorreo(proyectoId: number, correo: string) {
  const [row] = await db
    .select({ id: registro.id })
    .from(registro)
    .where(and(eq(registro.proyectoId, proyectoId), eq(registro.correo, correo)))
    .orderBy(desc(registro.createdAt), desc(registro.id))
    .limit(1);

  return row ?? null;
}

async function resolveEncuestaContactId(proyectoId: number, correo: string) {
  const linkedRegistro = await findLatestRegistroByProjectAndCorreo(proyectoId, correo);
  return linkedRegistro ? String(linkedRegistro.id) : null;
}

function addImportError(errors: string[], rowIndex: number, message: string) {
  errors.push(`Fila ${rowIndex}: ${message}`);
}

function buildImportPlan(
  mappings: CsvImportMapping[],
  row: Record<string, string>,
): {
  fields: Record<string, string>;
  metadata: Record<string, JsonValue>;
  respuestas: Record<string, JsonValue>;
} {
  const fields: Record<string, string> = {};
  const metadata: Record<string, JsonValue> = {};
  const respuestas: Record<string, JsonValue> = {};

  for (const mapping of mappings) {
    if (mapping.kind === 'ignore') continue;

    const value = readMappedRowValue(row, mapping.sourceKey);
    if (value === null) continue;

    if (mapping.kind === 'field') {
      fields[mapping.targetKey] = value;
      continue;
    }

    if (mapping.kind === 'metadata') {
      metadata[mapping.targetKey] = value;
      continue;
    }

    respuestas[mapping.targetKey] = value;
  }

  return { fields, metadata, respuestas };
}

async function findProjectById(id: number) {
  const [row] = await db
    .select({
      id: project.id,
      nombre: project.nombre,
      metaMetricsUrl: project.metaMetricsUrl,
      metaMetricsSheetId: project.metaMetricsSheetId,
      metaMetricsSheetIndex: project.metaMetricsSheetIndex,
      pageMetricsUrls: project.pageMetricsUrls,
      salesProjectCode: project.salesProjectCode,
      vipProductId: project.vipProductId,
      salesEditionId: project.salesEditionId,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(eq(project.id, id))
    .limit(1);

  return row
    ? {
        ...row,
        pageMetricsUrls: readPageMetricsUrls(row.pageMetricsUrls),
        createdAt: row.createdAt.toISOString(),
      }
    : null;
}

async function listAccessibleProjectsForUser(userId: string) {
  const access = await resolveProjectAccess(userId);
  if (access.isAdmin) {
    const projects = await db
      .select({
        id: project.id,
        nombre: project.nombre,
        metaMetricsUrl: project.metaMetricsUrl,
        metaMetricsSheetId: project.metaMetricsSheetId,
        metaMetricsSheetIndex: project.metaMetricsSheetIndex,
        pageMetricsUrls: project.pageMetricsUrls,
        salesProjectCode: project.salesProjectCode,
        vipProductId: project.vipProductId,
        salesEditionId: project.salesEditionId,
        createdAt: project.createdAt,
      })
      .from(project)
      .orderBy(project.nombre);
    return { access, projects };
  }

  const projectIds = [...(access.projectIds ?? [])];
  if (projectIds.length === 0) return { access, projects: [] };

  const projects = await db
    .select({
      id: project.id,
      nombre: project.nombre,
      metaMetricsUrl: project.metaMetricsUrl,
      metaMetricsSheetId: project.metaMetricsSheetId,
      metaMetricsSheetIndex: project.metaMetricsSheetIndex,
      pageMetricsUrls: project.pageMetricsUrls,
      salesProjectCode: project.salesProjectCode,
      vipProductId: project.vipProductId,
      salesEditionId: project.salesEditionId,
      createdAt: project.createdAt,
    })
    .from(project)
    .where(inArray(project.id, projectIds))
    .orderBy(project.nombre);
  return { access, projects };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      toJsonValue(item),
    ]);
    return Object.fromEntries(entries);
  }
  return String(value);
}

function toRegistroItem(row: {
  id: number;
  proyectoId: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  metadata: unknown;
  origen: string;
  createdAt: Date;
}): RegistroItem {
  return {
    id: row.id,
    proyectoId: row.proyectoId,
    nombre: row.nombre,
    correo: row.correo,
    telefono: row.telefono,
    metadata: toJsonValue(row.metadata),
    origen: row.origen,
    createdAt: row.createdAt.toISOString(),
  };
}

function toGrupoItem(row: {
  id: number;
  proyectoId: number;
  telefono: string;
  campana: string;
  grupo: string;
  evento: GrupoEvento;
  fecha: Date;
  createdAt: Date;
}): GrupoItem {
  return {
    id: row.id,
    proyectoId: row.proyectoId,
    telefono: row.telefono,
    campana: row.campana,
    grupo: row.grupo,
    evento: row.evento,
    fecha: row.fecha.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toEncuestaItem(row: {
  id: number;
  proyectoId: number;
  contactId: string;
  respuestas: unknown;
  score: number | null;
  createdAt: Date;
}): EncuestaItem {
  return {
    id: row.id,
    proyectoId: row.proyectoId,
    contactId: row.contactId,
    respuestas: toJsonValue(row.respuestas),
    score: row.score,
    createdAt: row.createdAt.toISOString(),
  };
}

type ProjectTablePageParams = {
  pageIndex: number;
  pageSize: number;
};

type ProjectRegistrosFilterParams = {
  projectId: number;
  query: string;
  origin: string;
  dateFrom: string;
  dateTo: string;
};

export type ProjectEncuestasFilterParams = {
  projectId: number;
  query: string;
  dateFrom: string;
  dateTo: string;
  scoreMode?: EncuestaScoreMode;
  scoreMin?: string;
  scoreMax?: string;
};

type ProjectGruposFilterParams = {
  projectId: number;
  query: string;
  dateFrom: string;
  dateTo: string;
};

type ProjectRegistrosPageParams = ProjectRegistrosFilterParams & ProjectTablePageParams;

type ProjectEncuestasPageParams = ProjectEncuestasFilterParams & ProjectTablePageParams;

type ProjectGruposPageParams = ProjectGruposFilterParams & ProjectTablePageParams;

function normalizePageIndex(value: number) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function normalizePageSize(value: number) {
  if (!Number.isFinite(value)) return 25;
  return Math.min(100, Math.max(10, Math.floor(value)));
}

function normalizeSearchQuery(value: string) {
  return value.trim().toLowerCase();
}

function buildDateRangeCondition(
  column: typeof registro.createdAt | typeof encuesta.createdAt | typeof grupo.fecha,
  dateFrom: string,
  dateTo: string,
) {
  const conditions = [];

  if (dateFrom) {
    conditions.push(sql`${column} >= ${new Date(`${dateFrom}T00:00:00`)}`);
  }

  if (dateTo) {
    conditions.push(sql`${column} <= ${new Date(`${dateTo}T23:59:59.999`)}`);
  }

  return conditions;
}

function buildRegistrosConditions(data: ProjectRegistrosFilterParams) {
  const query = normalizeSearchQuery(data.query);

  return [
    eq(registro.proyectoId, data.projectId),
    ...(data.origin ? [eq(registro.origen, data.origin)] : []),
    ...buildDateRangeCondition(registro.createdAt, data.dateFrom, data.dateTo),
    ...(query
      ? [
          sql`lower(concat_ws(' ', ${registro.nombre}, ${registro.correo}, coalesce(${registro.telefono}, ''), ${registro.origen}, cast(${registro.metadata} as char))) like ${`%${query}%`}`,
        ]
      : []),
  ];
}

const CONTACT_LOOKUP_MAX_IDS = 5000;

function normalizeScore(value: string | undefined) {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

// Rows without a score never match a score filter: a NULL comparison is unknown
// in SQL, so those rows drop out on their own.
function buildScoreCondition(data: ProjectEncuestasFilterParams) {
  const min = normalizeScore(data.scoreMin);
  const max = normalizeScore(data.scoreMax);

  switch (data.scoreMode) {
    case 'gt':
      return min === null ? [] : [gte(encuesta.score, min)];
    case 'lt':
      return max === null ? [] : [lte(encuesta.score, max)];
    case 'between': {
      if (min !== null && max !== null) {
        return [gte(encuesta.score, Math.min(min, max)), lte(encuesta.score, Math.max(min, max))];
      }
      if (min !== null) return [gte(encuesta.score, min)];
      if (max !== null) return [lte(encuesta.score, max)];
      return [];
    }
    default:
      return [];
  }
}

export function buildEncuestasConditions(data: ProjectEncuestasFilterParams) {
  const query = normalizeSearchQuery(data.query);

  return [
    eq(encuesta.proyectoId, data.projectId),
    ...buildDateRangeCondition(encuesta.createdAt, data.dateFrom, data.dateTo),
    ...buildScoreCondition(data),
    ...(query
      ? [
          sql`lower(concat_ws(' ', ${encuesta.contactId}, coalesce(cast(${encuesta.score} as char), ''), cast(${encuesta.respuestas} as char))) like ${`%${query}%`}`,
        ]
      : []),
  ];
}

function buildGruposConditions(data: ProjectGruposFilterParams) {
  const query = normalizeSearchQuery(data.query);

  return [
    eq(grupo.proyectoId, data.projectId),
    ...buildDateRangeCondition(grupo.fecha, data.dateFrom, data.dateTo),
    ...(query
      ? [
          sql`lower(concat_ws(' ', ${grupo.telefono}, ${grupo.campana}, ${grupo.grupo})) like ${`%${query}%`}`,
        ]
      : []),
  ];
}

// Entries, exits and live assignments per project, in one pass. Membership is a
// net over `(telefono, grupo)` (ADR 0016), so it cannot be read off a row count:
// the inner query nets each pair and the outer one keeps the pairs still open.
// `grupos_proyecto_telefono_grupo_idx` exists for exactly this grouping.
function selectGruposStats(where: SQL | undefined) {
  const pares = db
    .select({
      projectId: grupo.proyectoId,
      entradas: sql<string>`sum(case when ${grupo.evento} = 'entrada' then 1 else 0 end)`.as(
        'entradas',
      ),
      salidas: sql<string>`sum(case when ${grupo.evento} = 'salida' then 1 else 0 end)`.as(
        'salidas',
      ),
      neto: sql<string>`sum(case when ${grupo.evento} = 'entrada' then 1 else -1 end)`.as('neto'),
      latestAt: max(grupo.fecha).as('latest_at'),
    })
    .from(grupo)
    .where(where)
    .groupBy(grupo.proyectoId, grupo.telefono, grupo.grupo)
    .as('pares');

  return db
    .select({
      projectId: pares.projectId,
      entradas: sql<string>`sum(${pares.entradas})`,
      salidas: sql<string>`sum(${pares.salidas})`,
      participantes: sql<string>`sum(case when ${pares.neto} > 0 then 1 else 0 end)`,
      // `mapWith` is not optional here: `max(column)` carries the column's
      // mapper, but this outer `max` is over a derived-table column and would
      // hand back the driver's raw datetime string instead of a `Date`.
      latestAt: sql<Date | null>`max(${pares.latestAt})`.mapWith(grupo.fecha),
    })
    .from(pares)
    .groupBy(pares.projectId);
}

function extractJsonKeys(values: unknown[]) {
  const keys = new Set<string>();

  for (const value of values) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const key of Object.keys(value as Record<string, unknown>)) keys.add(key);
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

export const fetchProjectsOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProjectsOverview> => {
    const { session } = await assertPermission('projects:read');
    const { access, projects } = await listAccessibleProjectsForUser(session.user.id);
    const projectIds = projects.map((item) => item.id);
    if (!access.isAdmin && projectIds.length === 0) {
      return { projects: [] };
    }

    const [registrosGrouped, encuestasGrouped, gruposGrouped] = await Promise.all([
      db
        .select({
          projectId: registro.proyectoId,
          total: count(registro.id),
          latestAt: max(registro.createdAt),
        })
        .from(registro)
        .where(access.isAdmin ? undefined : inArray(registro.proyectoId, projectIds))
        .groupBy(registro.proyectoId),
      db
        .select({
          projectId: encuesta.proyectoId,
          total: count(encuesta.id),
          latestAt: max(encuesta.createdAt),
        })
        .from(encuesta)
        .where(access.isAdmin ? undefined : inArray(encuesta.proyectoId, projectIds))
        .groupBy(encuesta.proyectoId),
      selectGruposStats(access.isAdmin ? undefined : inArray(grupo.proyectoId, projectIds)),
    ]);

    const registrosMap = new Map(registrosGrouped.map((row) => [row.projectId, row]));
    const encuestasMap = new Map(encuestasGrouped.map((row) => [row.projectId, row]));
    const gruposMap = new Map(gruposGrouped.map((row) => [row.projectId, row]));

    return {
      projects: projects.map((item) => {
        const registrosStats = registrosMap.get(item.id);
        const encuestasStats = encuestasMap.get(item.id);
        const gruposStats = gruposMap.get(item.id);
        return {
          id: item.id,
          nombre: item.nombre,
          metaMetricsUrl: item.metaMetricsUrl,
          metaMetricsSheetId: item.metaMetricsSheetId,
          metaMetricsSheetIndex: item.metaMetricsSheetIndex,
          pageMetricsUrls: readPageMetricsUrls(item.pageMetricsUrls),
          salesProjectCode: item.salesProjectCode,
          vipProductId: item.vipProductId,
          salesEditionId: item.salesEditionId,
          createdAt: item.createdAt.toISOString(),
          registrosCount: registrosStats ? Number(registrosStats.total) : 0,
          encuestasCount: encuestasStats ? Number(encuestasStats.total) : 0,
          gruposCount: gruposStats ? Number(gruposStats.entradas) : 0,
          gruposSalidasCount: gruposStats ? Number(gruposStats.salidas) : 0,
          gruposParticipantesCount: gruposStats ? Number(gruposStats.participantes) : 0,
          latestRegistroAt: registrosStats?.latestAt ? registrosStats.latestAt.toISOString() : null,
          latestEncuestaAt: encuestasStats?.latestAt ? encuestasStats.latestAt.toISOString() : null,
          latestGrupoAt: gruposStats?.latestAt ? gruposStats.latestAt.toISOString() : null,
        };
      }),
    };
  },
);

export const fetchProjectRegistrosPage = createServerFn({ method: 'GET' })
  .inputValidator((data: ProjectRegistrosPageParams) => data)
  .handler(async ({ data }): Promise<ProjectRegistrosPage> => {
    await assertProjectPermission('projects:read', data.projectId);

    const pageIndex = normalizePageIndex(data.pageIndex);
    const pageSize = normalizePageSize(data.pageSize);
    const whereConditions = buildRegistrosConditions(data);

    const [rows, totalRows, originRows, metadataRows] = await Promise.all([
      db
        .select({
          id: registro.id,
          proyectoId: registro.proyectoId,
          nombre: registro.nombre,
          correo: registro.correo,
          telefono: registro.telefono,
          metadata: registro.metadata,
          origen: registro.origen,
          createdAt: registro.createdAt,
        })
        .from(registro)
        .where(and(...whereConditions))
        .orderBy(desc(registro.createdAt), desc(registro.id))
        .limit(pageSize)
        .offset(pageIndex * pageSize),
      db
        .select({ total: count(registro.id) })
        .from(registro)
        .where(and(...whereConditions)),
      db
        .select({ origen: registro.origen })
        .from(registro)
        .where(eq(registro.proyectoId, data.projectId)),
      db
        .select({ metadata: registro.metadata })
        .from(registro)
        .where(eq(registro.proyectoId, data.projectId)),
    ]);

    return {
      rows: rows.map((item) => toRegistroItem(item)),
      total: Number(totalRows[0]?.total ?? 0),
      pageIndex,
      pageSize,
      origins: Array.from(new Set(originRows.map((row) => row.origen))).sort((a, b) =>
        a.localeCompare(b),
      ),
      metadataKeys: extractJsonKeys(metadataRows.map((row) => row.metadata)),
    };
  });

export const fetchProjectEncuestasPage = createServerFn({ method: 'GET' })
  .inputValidator((data: ProjectEncuestasPageParams) => data)
  .handler(async ({ data }): Promise<ProjectEncuestasPage> => {
    await assertProjectPermission('projects:read', data.projectId);

    const pageIndex = normalizePageIndex(data.pageIndex);
    const pageSize = normalizePageSize(data.pageSize);
    const whereConditions = buildEncuestasConditions(data);

    const [rows, totalRows, surveyRows] = await Promise.all([
      db
        .select({
          id: encuesta.id,
          proyectoId: encuesta.proyectoId,
          contactId: encuesta.contactId,
          respuestas: encuesta.respuestas,
          score: encuesta.score,
          createdAt: encuesta.createdAt,
        })
        .from(encuesta)
        .where(and(...whereConditions))
        .orderBy(desc(encuesta.createdAt), desc(encuesta.id))
        .limit(pageSize)
        .offset(pageIndex * pageSize),
      db
        .select({ total: count(encuesta.id) })
        .from(encuesta)
        .where(and(...whereConditions)),
      db
        .select({ respuestas: encuesta.respuestas })
        .from(encuesta)
        .where(eq(encuesta.proyectoId, data.projectId)),
    ]);

    const contactIds = Array.from(new Set(rows.map((row) => row.contactId).filter(Boolean)));
    const contactos =
      contactIds.length === 0
        ? []
        : await db
            .select({
              id: registro.id,
              nombre: registro.nombre,
              correo: registro.correo,
              telefono: registro.telefono,
              origen: registro.origen,
              metadata: registro.metadata,
              createdAt: registro.createdAt,
            })
            .from(registro)
            .where(
              and(
                eq(registro.proyectoId, data.projectId),
                inArray(registro.id, contactIds.map(Number)),
              ),
            )
            .orderBy(desc(registro.createdAt), desc(registro.id));

    return {
      rows: rows.map((item) => toEncuestaItem(item)),
      total: Number(totalRows[0]?.total ?? 0),
      pageIndex,
      pageSize,
      surveyKeys: extractJsonKeys(surveyRows.map((row) => row.respuestas)),
      contactos: contactos.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        correo: row.correo,
        telefono: row.telefono,
        origen: row.origen,
        metadata: toJsonValue(row.metadata),
        createdAt: row.createdAt.toISOString(),
      })),
    };
  });

export const fetchProjectGruposPage = createServerFn({ method: 'GET' })
  .inputValidator((data: ProjectGruposPageParams) => data)
  .handler(async ({ data }): Promise<ProjectGruposPage> => {
    await assertProjectPermission('projects:read', data.projectId);

    const pageIndex = normalizePageIndex(data.pageIndex);
    const pageSize = normalizePageSize(data.pageSize);
    const whereConditions = buildGruposConditions(data);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: grupo.id,
          proyectoId: grupo.proyectoId,
          telefono: grupo.telefono,
          campana: grupo.campana,
          grupo: grupo.grupo,
          evento: grupo.evento,
          fecha: grupo.fecha,
          createdAt: grupo.createdAt,
        })
        .from(grupo)
        .where(and(...whereConditions))
        .orderBy(desc(grupo.fecha), desc(grupo.id))
        .limit(pageSize)
        .offset(pageIndex * pageSize),
      db
        .select({ total: count(grupo.id) })
        .from(grupo)
        .where(and(...whereConditions)),
    ]);

    return {
      rows: rows.map((item) => toGrupoItem(item)),
      total: Number(totalRows[0]?.total ?? 0),
      pageIndex,
      pageSize,
    };
  });

export const fetchProjectRegistrosExport = createServerFn({ method: 'GET' })
  .inputValidator((data: ProjectRegistrosFilterParams) => data)
  .handler(async ({ data }): Promise<ProjectRegistrosExport> => {
    await assertProjectPermission('projects:read', data.projectId);

    const rows = await db
      .select({
        id: registro.id,
        proyectoId: registro.proyectoId,
        nombre: registro.nombre,
        correo: registro.correo,
        telefono: registro.telefono,
        metadata: registro.metadata,
        origen: registro.origen,
        createdAt: registro.createdAt,
      })
      .from(registro)
      .where(and(...buildRegistrosConditions(data)))
      .orderBy(desc(registro.createdAt), desc(registro.id));

    return { rows: rows.map((item) => toRegistroItem(item)) };
  });

export const fetchProjectGruposExport = createServerFn({ method: 'GET' })
  .inputValidator((data: ProjectGruposFilterParams) => data)
  .handler(async ({ data }): Promise<ProjectGruposExport> => {
    await assertProjectPermission('projects:read', data.projectId);

    const rows = await db
      .select({
        id: grupo.id,
        proyectoId: grupo.proyectoId,
        telefono: grupo.telefono,
        campana: grupo.campana,
        grupo: grupo.grupo,
        evento: grupo.evento,
        fecha: grupo.fecha,
        createdAt: grupo.createdAt,
      })
      .from(grupo)
      .where(and(...buildGruposConditions(data)))
      .orderBy(desc(grupo.fecha), desc(grupo.id));

    return { rows: rows.map((item) => toGrupoItem(item)) };
  });

export const createProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      nombre: string;
      metaMetricsUrl?: string;
      metaMetricsSheetId?: string;
      metaMetricsSheetIndex?: number | string;
      pageMetricsUrls?: string[];
      salesProjectCode?: string;
      vipProductId?: string;
      salesEditionId?: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<ProjectMutationResult> => {
    try {
      const { session, headers } = await assertPermission('projects:write');
      const access = await resolveProjectAccess(session.user.id);
      const nombre = normalizeNombre(data.nombre);
      const rawMetaMetricsUrl = data.metaMetricsUrl?.trim() ?? '';
      const metaMetricsUrl = normalizeMetaMetricsUrl(data.metaMetricsUrl);
      const metaMetricsSheetId = normalizeMetaMetricsSheetId(data.metaMetricsSheetId);
      const metaMetricsSheetIndex = normalizeMetaMetricsSheetIndex(data.metaMetricsSheetIndex);
      const pageMetricsUrls = normalizePageMetricsUrls(data.pageMetricsUrls);
      const salesProjectCode = normalizeNullableString(data.salesProjectCode);
      const vipProductId = normalizeNullableString(data.vipProductId);
      const salesEditionId = normalizeNullableString(data.salesEditionId);

      if (!nombre) return { ok: false, error: es.projects.nameRequired };
      if (pageMetricsUrls.invalid) return { ok: false, error: es.projects.pageMetricsInvalidUrl };
      const rawMetaMetricsSheetId = data.metaMetricsSheetId?.trim() ?? '';
      const hasAnyMetaConfig =
        rawMetaMetricsUrl.length > 0 ||
        rawMetaMetricsSheetId.length > 0 ||
        data.metaMetricsSheetIndex !== undefined;
      const hasFullMetaConfig =
        metaMetricsUrl !== null && metaMetricsSheetId !== null && metaMetricsSheetIndex !== null;
      if ((hasAnyMetaConfig && !hasFullMetaConfig) || (!hasAnyMetaConfig && hasFullMetaConfig)) {
        return { ok: false, error: es.projects.metaMetricsConfigRequired };
      }

      const [existing] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.nombre, nombre))
        .limit(1);
      if (existing) return { ok: false, error: es.projects.duplicateName };

      const [createdId] = await db
        .insert(project)
        .values({
          nombre,
          metaMetricsUrl,
          metaMetricsSheetId,
          metaMetricsSheetIndex,
          pageMetricsUrls: pageMetricsUrls.urls,
          salesProjectCode,
          vipProductId,
          salesEditionId,
        })
        .$returningId();
      if (!createdId) return { ok: false, error: es.errors.generic };

      if (!access.isAdmin) {
        await db.insert(userProjectAccess).values({
          userId: session.user.id,
          projectId: createdId.id,
          grantedBy: session.user.id,
        });
      }

      const created = await findProjectById(createdId.id);
      if (!created) return { ok: false, error: es.errors.generic };

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.created',
        targetType: 'project',
        targetId: String(created.id),
        metadata: {
          nombre,
          metaMetricsUrl,
          metaMetricsSheetId,
          metaMetricsSheetIndex,
          pageMetricsUrls: pageMetricsUrls.urls,
          salesProjectCode,
          vipProductId,
          salesEditionId,
        },
      });

      return { ok: true, project: created };
    } catch (err) {
      logServerError('createProjectEntry', { nombre: data.nombre }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const updateProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      id: number;
      nombre: string;
      metaMetricsUrl?: string;
      metaMetricsSheetId?: string;
      metaMetricsSheetIndex?: number | string;
      pageMetricsUrls?: string[];
      salesProjectCode?: string;
      vipProductId?: string;
      salesEditionId?: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<ProjectMutationResult> => {
    try {
      const { session, headers } = await assertProjectPermission('projects:write', data.id);
      const nombre = normalizeNombre(data.nombre);
      const rawMetaMetricsUrl = data.metaMetricsUrl?.trim() ?? '';
      const metaMetricsUrl = normalizeMetaMetricsUrl(data.metaMetricsUrl);
      const metaMetricsSheetId = normalizeMetaMetricsSheetId(data.metaMetricsSheetId);
      const metaMetricsSheetIndex = normalizeMetaMetricsSheetIndex(data.metaMetricsSheetIndex);
      const pageMetricsUrls = normalizePageMetricsUrls(data.pageMetricsUrls);
      const salesProjectCode = normalizeNullableString(data.salesProjectCode);
      const vipProductId = normalizeNullableString(data.vipProductId);
      const salesEditionId = normalizeNullableString(data.salesEditionId);

      if (!nombre) return { ok: false, error: es.projects.nameRequired };
      if (pageMetricsUrls.invalid) return { ok: false, error: es.projects.pageMetricsInvalidUrl };
      const rawMetaMetricsSheetId = data.metaMetricsSheetId?.trim() ?? '';
      const hasAnyMetaConfig =
        rawMetaMetricsUrl.length > 0 ||
        rawMetaMetricsSheetId.length > 0 ||
        data.metaMetricsSheetIndex !== undefined;
      const hasFullMetaConfig =
        metaMetricsUrl !== null && metaMetricsSheetId !== null && metaMetricsSheetIndex !== null;
      if ((hasAnyMetaConfig && !hasFullMetaConfig) || (!hasAnyMetaConfig && hasFullMetaConfig)) {
        return { ok: false, error: es.projects.metaMetricsConfigRequired };
      }

      const current = await findProjectById(data.id);
      if (!current) return { ok: false, error: es.projects.notFound };

      if (nombre !== current.nombre) {
        const [duplicate] = await db
          .select({ id: project.id })
          .from(project)
          .where(eq(project.nombre, nombre))
          .limit(1);
        if (duplicate) return { ok: false, error: es.projects.duplicateName };
      }

      await db
        .update(project)
        .set({
          nombre,
          metaMetricsUrl,
          metaMetricsSheetId,
          metaMetricsSheetIndex,
          pageMetricsUrls: pageMetricsUrls.urls,
          salesProjectCode,
          vipProductId,
          salesEditionId,
        })
        .where(eq(project.id, data.id));
      const updated = await findProjectById(data.id);
      if (!updated) return { ok: false, error: es.projects.notFound };

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.updated',
        targetType: 'project',
        targetId: String(data.id),
        metadata: {
          nombre,
          metaMetricsUrl,
          metaMetricsSheetId,
          metaMetricsSheetIndex,
          pageMetricsUrls: pageMetricsUrls.urls,
          salesProjectCode,
          vipProductId,
          salesEditionId,
        },
      });

      return { ok: true, project: updated };
    } catch (err) {
      logServerError('updateProjectEntry', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deleteProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<DeleteProjectResult> => {
    try {
      const { session, headers } = await assertProjectPermission('projects:delete', data.id);

      const current = await findProjectById(data.id);
      if (!current) return { ok: false, error: es.projects.notFound };

      await db.delete(project).where(eq(project.id, data.id));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.deleted',
        targetType: 'project',
        targetId: String(data.id),
        metadata: { nombre: current.nombre },
      });

      return { ok: true, deletedId: data.id };
    } catch (err) {
      logServerError('deleteProjectEntry', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const fetchProjectMetaGoalMetrics = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number; dateStart: string; dateEnd: string }) => data)
  .handler(async ({ data }): Promise<ProjectMetaGoalMetricsResult> => {
    await assertProjectPermission('projects:read', data.projectId);

    const current = await findProjectById(data.projectId);
    if (!current) return { status: 'error', message: es.projects.notFound };

    if (
      !current.metaMetricsUrl ||
      !current.metaMetricsSheetId ||
      current.metaMetricsSheetIndex === null
    ) {
      return { status: 'not-configured', message: es.projects.metaMetricsNotConfigured };
    }

    try {
      const url = new URL(current.metaMetricsUrl);
      url.searchParams.set('id', current.metaMetricsSheetId);
      url.searchParams.set('index', String(current.metaMetricsSheetIndex));
      url.searchParams.set('dateStart', data.dateStart);
      url.searchParams.set('dateEnd', data.dateEnd);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return { status: 'error', message: es.projects.metaMetricsFetchFailed };
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const toNumber = (value: unknown) =>
        typeof value === 'number' && Number.isFinite(value) ? value : 0;

      return {
        status: 'success',
        metrics: {
          dateStart: typeof payload.dateStart === 'string' ? payload.dateStart : data.dateStart,
          dateEnd: typeof payload.dateEnd === 'string' ? payload.dateEnd : data.dateEnd,
          spend: toNumber(payload['Spend (Cost, Amount Spent)']),
          linkClicks: toNumber(payload['Action Link Clicks']),
          landingPageViews: toNumber(payload['Action Landing Page View']),
          completeRegistrations: toNumber(
            payload['Action FB Pixel Complete Registration (Offsite Conversion)'],
          ),
          leads: toNumber(payload['Action FB Pixel Lead (Offsite Conversion)']),
          subscribes: toNumber(payload['Action Subscribe Website']),
        },
      };
    } catch (err) {
      logServerError('fetchProjectMetaGoalMetrics', { projectId: data.projectId }, err);
      return { status: 'error', message: es.projects.metaMetricsFetchFailed };
    }
  });

export const fetchProjectPageMetrics = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }): Promise<ProjectPageMetricsResult> => {
    await assertProjectPermission('projects:read', data.projectId);

    const current = await findProjectById(data.projectId);
    if (!current) return { status: 'error', message: es.projects.notFound };
    if (current.pageMetricsUrls.length === 0) {
      return { status: 'not-configured', message: es.projects.pageMetricsNotConfigured };
    }

    const toNumber = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : 0;

    const requests = await Promise.all(
      current.pageMetricsUrls.map(async (endpointUrl) => {
        try {
          const response = await fetch(endpointUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (!response.ok) {
            return {
              ok: false as const,
              empty: false as const,
              endpointUrl,
              message: es.projects.pageMetricsFetchFailed,
            };
          }

          // A 200 with an empty body is how these rotator endpoints report
          // "nothing yet". Feeding that to response.json() raises a SyntaxError
          // from undici whose stack points at the parser, not at the cause, and
          // logServerError would write an `error_log` row on every page load.
          // It is an upstream state, and the UI already surfaces it as a
          // failed endpoint.
          const raw = (await response.text()).trim();
          if (!raw) {
            return {
              ok: false as const,
              empty: true as const,
              endpointUrl,
              message: es.projects.pageMetricsEmptyResponse,
            };
          }

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            // Non-empty and still not JSON is worth a row, but logged with the
            // head of the body: that is what tells you whether the endpoint is
            // serving an HTML error page instead of metrics.
            throw new Error(`La respuesta no es JSON: ${raw.slice(0, 120)}`);
          }

          const rotator = payload.rotator as Record<string, unknown> | null;
          const totals = payload.totals as Record<string, unknown> | null;
          const externalMetrics = payload.externalMetrics as Record<string, unknown> | null;
          const destinations = Array.isArray(payload.destinations) ? payload.destinations : [];

          return {
            ok: true as const,
            item: {
              endpointUrl,
              generatedAt: typeof payload.generatedAt === 'string' ? payload.generatedAt : null,
              rotator: {
                id: rotator && typeof rotator.id === 'number' ? rotator.id : 0,
                title: rotator && typeof rotator.title === 'string' ? rotator.title : endpointUrl,
                slug: rotator && typeof rotator.slug === 'string' ? rotator.slug : '',
                url: rotator && typeof rotator.url === 'string' ? rotator.url : '',
              },
              totals: {
                clicks: totals ? toNumber(totals.clicks) : 0,
                conversions: totals ? toNumber(totals.conversions) : 0,
                conversionRate: totals ? toNumber(totals.conversionRate) : 0,
              },
              destinations: destinations.map((destination) => {
                const row = destination as Record<string, unknown>;
                return {
                  key: typeof row.key === 'string' ? row.key : '',
                  externalKey: typeof row.externalKey === 'string' ? row.externalKey : null,
                  url: typeof row.url === 'string' ? row.url : '',
                  weight: toNumber(row.weight),
                  active: row.active === true,
                  clicks: toNumber(row.clicks),
                  conversions: toNumber(row.conversions),
                  conversionRate: toNumber(row.conversionRate),
                  scorePromedio:
                    typeof row.scorePromedio === 'number' && Number.isFinite(row.scorePromedio)
                      ? row.scorePromedio
                      : null,
                };
              }),
              externalMetrics: {
                ok: externalMetrics?.ok === true,
                field:
                  externalMetrics && typeof externalMetrics.field === 'string'
                    ? externalMetrics.field
                    : null,
                error:
                  externalMetrics && typeof externalMetrics.error === 'string'
                    ? externalMetrics.error
                    : null,
              },
            },
          };
        } catch (err) {
          logServerError(
            'fetchProjectPageMetrics',
            { projectId: data.projectId, endpointUrl },
            err,
          );
          return {
            ok: false as const,
            empty: false as const,
            endpointUrl,
            message: es.projects.pageMetricsFetchFailed,
          };
        }
      }),
    );

    const items = requests.filter((item) => item.ok).map((item) => item.item);
    const failures = requests
      .filter((item) => !item.ok)
      .map((item) => ({ endpointUrl: item.endpointUrl, message: item.message }));

    // Every endpoint answering "nothing yet" is not the same as every endpoint
    // breaking, and the difference is what tells you whether to go look at the
    // rotator or at the network.
    if (items.length === 0) {
      const failed = requests.filter((item) => !item.ok);
      const allEmpty = failed.length > 0 && failed.every((item) => item.empty);
      return {
        status: 'error',
        message: allEmpty
          ? es.projects.pageMetricsEmptyResponse
          : es.projects.pageMetricsFetchFailed,
      };
    }

    return { status: 'success', items, failures };
  });

// Rows are folded in batches so a project with tens of thousands of records
// never materializes whole, neither here nor in the browser.
const DASH_SCAN_CHUNK = 5000;

async function scanInChunks<T extends { id: number }>(
  read: (afterId: number) => Promise<T[]>,
  consume: (row: T) => void,
) {
  let afterId = 0;

  while (true) {
    const rows = await read(afterId);
    if (rows.length === 0) return;

    for (const row of rows) consume(row);

    const lastId = rows.at(-1)?.id;
    if (lastId === undefined || rows.length < DASH_SCAN_CHUNK) return;
    afterId = lastId;
  }
}

/**
 * `$."key"` for `json_extract`. The key comes from the dash selector, so it is
 * escaped for the JSON path grammar and bound as a query parameter — it is never
 * concatenated into the SQL text.
 */
function toJsonPath(key: string) {
  return `$."${key.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Everything the project dash renders, already reduced. Replaces the previous
 * `fetchProjectDetail` call, which shipped every row to the browser (~48 MB on a
 * large project, enough for the transfer to abort and leave the dash empty).
 */
export const fetchProjectDashMetrics = createServerFn({ method: 'GET' })
  .inputValidator(
    (data: {
      projectId: number;
      dateStart: string;
      dateEnd: string;
      /** Dash "origen base": `__origen__` or a `registros.metadata` key. */
      originBaseKey?: string;
    }) => data,
  )
  .handler(async ({ data }): Promise<ProjectDashPayload> => {
    await assertProjectPermission('projects:read', data.projectId);

    const { projectId, dateStart, dateEnd } = data;
    const originBaseKey = data.originBaseKey?.trim() || ORIGIN_BASE_DEFAULT_KEY;
    const usesMetadataBase = originBaseKey !== ORIGIN_BASE_DEFAULT_KEY;
    const aggregator = createDashAggregator(dateStart, dateEnd, originBaseKey);

    // `date_format` (not `date`) keeps the day as a string: the MySQL driver
    // would hand back a Date for a DATE column and reintroduce timezone drift.
    const registroDay = sql<string>`date_format(${registro.createdAt}, '%Y-%m-%d')`;
    const registroInRange = sql<number>`date(${registro.createdAt}) between ${dateStart} and ${dateEnd}`;
    const encuestaDay = sql<string>`date_format(${encuesta.createdAt}, '%Y-%m-%d')`;
    const encuestaInRange = sql<number>`date(${encuesta.createdAt}) between ${dateStart} and ${dateEnd}`;
    const grupoDay = sql<string>`date_format(${grupo.fecha}, '%Y-%m-%d')`;
    const grupoInRange = sql<number>`date(${grupo.fecha}) between ${dateStart} and ${dateEnd}`;
    // Membership at the close of the range needs every event up to that day, not
    // only the ones inside it: someone who entered before `dateStart` and never
    // left is still in the group while the range runs.
    const grupoUntilRangeEnd = sql<number>`date(${grupo.fecha}) <= ${dateEnd}`;

    // With a metadata origen base the value is extracted by MySQL, so this pass
    // still returns one short string per row instead of the whole JSON column —
    // and it covers every registro, not only the ones inside the range, which is
    // what lets encuestas and grupos be attributed to their lead's group.
    const baseOrigin = usesMetadataBase
      ? sql<
          string | null
        >`json_unquote(json_extract(${registro.metadata}, ${toJsonPath(originBaseKey)}))`
      : sql<string | null>`null`;

    await scanInChunks(
      (afterId) =>
        db
          .select({
            id: registro.id,
            correo: registro.correo,
            telefono: registro.telefono,
            origen: registro.origen,
            baseOrigin,
            dateKey: registroDay,
            inRange: registroInRange,
          })
          .from(registro)
          .where(and(eq(registro.proyectoId, projectId), gt(registro.id, afterId)))
          .orderBy(registro.id)
          .limit(DASH_SCAN_CHUNK),
      (row) =>
        aggregator.addRegistroBase({
          id: row.id,
          correo: row.correo,
          telefono: row.telefono,
          origen: row.origen,
          baseOrigin: row.baseOrigin === null ? null : String(row.baseOrigin),
          dateKey: String(row.dateKey),
          inRange: Number(row.inRange) === 1,
        }),
    );

    await scanInChunks(
      (afterId) =>
        db
          .select({
            id: encuesta.id,
            contactId: encuesta.contactId,
            score: encuesta.score,
            dateKey: encuestaDay,
            inRange: encuestaInRange,
          })
          .from(encuesta)
          .where(and(eq(encuesta.proyectoId, projectId), gt(encuesta.id, afterId)))
          .orderBy(encuesta.id)
          .limit(DASH_SCAN_CHUNK),
      (row) =>
        aggregator.addEncuestaBase({
          contactId: row.contactId,
          score: row.score,
          dateKey: String(row.dateKey),
          inRange: Number(row.inRange) === 1,
        }),
    );

    await scanInChunks(
      (afterId) =>
        db
          .select({
            id: grupo.id,
            telefono: grupo.telefono,
            grupo: grupo.grupo,
            evento: grupo.evento,
            dateKey: grupoDay,
            inRange: grupoInRange,
            untilRangeEnd: grupoUntilRangeEnd,
          })
          .from(grupo)
          .where(and(eq(grupo.proyectoId, projectId), gt(grupo.id, afterId)))
          .orderBy(grupo.id)
          .limit(DASH_SCAN_CHUNK),
      (row) =>
        aggregator.addGrupoBase({
          telefono: row.telefono,
          grupo: row.grupo,
          evento: row.evento,
          dateKey: String(row.dateKey),
          inRange: Number(row.inRange) === 1,
          untilRangeEnd: Number(row.untilRangeEnd) === 1,
        }),
    );

    // Only the rows inside the range carry their JSON columns, and only on this
    // second pass, so the heavy payload never leaves the database server.
    await scanInChunks(
      (afterId) =>
        db
          .select({
            id: registro.id,
            origen: registro.origen,
            metadata: registro.metadata,
            dateKey: registroDay,
          })
          .from(registro)
          .where(
            and(
              eq(registro.proyectoId, projectId),
              gt(registro.id, afterId),
              sql`date(${registro.createdAt}) between ${dateStart} and ${dateEnd}`,
            ),
          )
          .orderBy(registro.id)
          .limit(DASH_SCAN_CHUNK),
      (row) =>
        aggregator.addRegistroDetail({
          id: row.id,
          origen: row.origen,
          metadata: toJsonValue(row.metadata),
          dateKey: String(row.dateKey),
        }),
    );

    await scanInChunks(
      (afterId) =>
        db
          .select({ id: encuesta.id, respuestas: encuesta.respuestas })
          .from(encuesta)
          .where(
            and(
              eq(encuesta.proyectoId, projectId),
              gt(encuesta.id, afterId),
              sql`date(${encuesta.createdAt}) between ${dateStart} and ${dateEnd}`,
            ),
          )
          .orderBy(encuesta.id)
          .limit(DASH_SCAN_CHUNK),
      (row) => aggregator.addEncuestaDetail(toJsonValue(row.respuestas)),
    );

    return { ...aggregator.finish(), historical: await findHistoricalByProjectId(projectId) };
  });

async function findHistoricalByProjectId(projectId: number): Promise<HistoricalMetricsItem | null> {
  const [row] = await db
    .select()
    .from(metricaHistorica)
    .where(eq(metricaHistorica.proyectoId, projectId))
    .limit(1);

  if (!row) return null;

  return {
    proyectoId: row.proyectoId,
    desde: row.desde,
    hasta: row.hasta,
    registros: row.registros,
    encuestas: row.encuestas,
    grupos: row.grupos,
    vip: row.vip,
    organicos: row.organicos,
    leadsApi: row.leadsApi,
    inversionMeta: row.inversionMeta,
    inversionGoogle: row.inversionGoogle,
    inversionTiktok: row.inversionTiktok,
    picoCpl1: row.picoCpl1,
    picoCpl2: row.picoCpl2,
    picoCpl3: row.picoCpl3,
    picoCpl4: row.picoCpl4,
    fuente: row.fuente,
    notas: row.notas,
    updatedAt: row.updatedAt.toISOString(),
  };
}

// "Never both": a project has observed rows or a declared total for a window,
// never the two. A total already includes whatever the rows describe, so adding
// them double counts and preferring one silently discards the other. This counts
// what would collide before anything is written.
async function countObservedInWindow(projectId: number, desde: string, hasta: string) {
  const [registros, encuestas, grupos, ventas] = await Promise.all([
    db
      .select({ total: count(registro.id) })
      .from(registro)
      .where(
        and(
          eq(registro.proyectoId, projectId),
          sql`date(${registro.createdAt}) between ${desde} and ${hasta}`,
        ),
      ),
    db
      .select({ total: count(encuesta.id) })
      .from(encuesta)
      .where(
        and(
          eq(encuesta.proyectoId, projectId),
          sql`date(${encuesta.createdAt}) between ${desde} and ${hasta}`,
        ),
      ),
    db
      .select({ total: count(grupo.id) })
      .from(grupo)
      .where(
        and(
          eq(grupo.proyectoId, projectId),
          sql`date(${grupo.fecha}) between ${desde} and ${hasta}`,
        ),
      ),
    db
      .select({ total: count(acsVentaDiaria.id) })
      .from(acsVentaDiaria)
      .where(
        and(
          eq(acsVentaDiaria.proyectoId, projectId),
          sql`${acsVentaDiaria.dia} between ${desde} and ${hasta}`,
        ),
      ),
  ]);

  return {
    registros: Number(registros[0]?.total ?? 0),
    encuestas: Number(encuestas[0]?.total ?? 0),
    grupos: Number(grupos[0]?.total ?? 0),
    acsVentas: Number(ventas[0]?.total ?? 0),
  };
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// An empty field is `null` ("nobody has this figure"), not `0` ("measured, and it
// was zero"). The dash renders the two differently and the distinction is the
// whole reason these columns are nullable.
function normalizeHistoricalCount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || !Number.isInteger(parsed)) return Number.NaN;
  return parsed;
}

// Ad spend is DECIMAL(12,2) and stays a string end to end — see the column
// comment in the schema. `false` is this function's "invalid", because `NaN`
// cannot be carried by a string return.
function normalizeHistoricalAmount(value: number | string | null | undefined) {
  if (value === null || value === undefined) return null;
  const raw = typeof value === 'string' ? value.trim().replace(',', '.') : String(value);
  if (raw === '') return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(raw)) return false;
  return Number(raw).toFixed(2);
}

export const fetchProjectHistorical = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }): Promise<HistoricalMetricsItem | null> => {
    await assertProjectPermission('projects:read', data.projectId);
    return findHistoricalByProjectId(data.projectId);
  });

export const saveProjectHistorical = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number;
      desde: string;
      hasta: string;
      registros?: number | string | null;
      encuestas?: number | string | null;
      grupos?: number | string | null;
      vip?: number | string | null;
      organicos?: number | string | null;
      leadsApi?: number | string | null;
      inversionMeta?: number | string | null;
      inversionGoogle?: number | string | null;
      inversionTiktok?: number | string | null;
      picoCpl1?: number | string | null;
      picoCpl2?: number | string | null;
      picoCpl3?: number | string | null;
      picoCpl4?: number | string | null;
      fuente: string;
      notas?: string | null;
    }) => data,
  )
  .handler(async ({ data }): Promise<HistoricalMutationResult> => {
    try {
      const { session, headers } = await assertProjectPermission('projects:write', data.projectId);

      const current = await findProjectById(data.projectId);
      if (!current) return { ok: false, error: es.projects.notFound };

      const desde = data.desde?.trim() ?? '';
      const hasta = data.hasta?.trim() ?? '';
      if (!ISO_DAY.test(desde) || !ISO_DAY.test(hasta)) {
        return { ok: false, error: es.projects.historicalWindowRequired };
      }
      if (desde > hasta) return { ok: false, error: es.projects.historicalWindowOrder };

      const fuente = data.fuente?.trim() ?? '';
      if (!fuente) return { ok: false, error: es.projects.historicalSourceRequired };

      const registros = normalizeHistoricalCount(data.registros);
      const encuestas = normalizeHistoricalCount(data.encuestas);
      const grupos = normalizeHistoricalCount(data.grupos);
      const vip = normalizeHistoricalCount(data.vip);
      const organicos = normalizeHistoricalCount(data.organicos);
      const leadsApi = normalizeHistoricalCount(data.leadsApi);
      const picoCpl1 = normalizeHistoricalCount(data.picoCpl1);
      const picoCpl2 = normalizeHistoricalCount(data.picoCpl2);
      const picoCpl3 = normalizeHistoricalCount(data.picoCpl3);
      const picoCpl4 = normalizeHistoricalCount(data.picoCpl4);
      const counts = [
        registros,
        encuestas,
        grupos,
        vip,
        organicos,
        leadsApi,
        picoCpl1,
        picoCpl2,
        picoCpl3,
        picoCpl4,
      ];
      if (counts.some((value) => Number.isNaN(value))) {
        return { ok: false, error: es.projects.historicalCountInvalid };
      }

      const inversionMeta = normalizeHistoricalAmount(data.inversionMeta);
      const inversionGoogle = normalizeHistoricalAmount(data.inversionGoogle);
      const inversionTiktok = normalizeHistoricalAmount(data.inversionTiktok);
      const amounts = [inversionMeta, inversionGoogle, inversionTiktok];
      if (amounts.some((value) => value === false)) {
        return { ok: false, error: es.projects.historicalAmountInvalid };
      }

      // `organicos` is a slice of `registros`, so a bigger slice than the whole
      // is a typo, not a finding: refuse it.
      //
      // `leads_api` is deliberately NOT checked the same way even though it also
      // cannot exceed `registros` in principle. Real debriefings break that rule
      // — [0425] declares 155.717 in API against 139.674 registered — and this
      // table stores what the debriefing said, with the contradiction written
      // down in `notas`. Refusing it here would mean the figure could only be
      // stored by altering it.
      if (registros !== null && organicos !== null && organicos > registros) {
        return { ok: false, error: es.projects.historicalOrganicosOverRegistros };
      }

      if ([...counts, ...amounts].every((value) => value === null)) {
        return { ok: false, error: es.projects.historicalAllEmpty };
      }

      const observed = await countObservedInWindow(data.projectId, desde, hasta);
      const collisions: string[] = [];
      if (registros !== null && observed.registros > 0) {
        collisions.push(`${es.projects.recordsCol} (${observed.registros})`);
      }
      if (encuestas !== null && observed.encuestas > 0) {
        collisions.push(`${es.projects.surveysCol} (${observed.encuestas})`);
      }
      if (grupos !== null && observed.grupos > 0) {
        collisions.push(`${es.projects.groupEventsCol} (${observed.grupos})`);
      }
      if (collisions.length > 0) {
        return { ok: false, error: `${es.projects.historicalConflict} ${collisions.join(', ')}.` };
      }
      if (vip !== null && observed.acsVentas > 0) {
        return { ok: false, error: es.projects.historicalVipConflict };
      }

      const values = {
        proyectoId: data.projectId,
        desde,
        hasta,
        registros,
        encuestas,
        grupos,
        vip,
        organicos,
        leadsApi,
        // Narrowed above: `false` (invalid) already returned.
        inversionMeta: inversionMeta as string | null,
        inversionGoogle: inversionGoogle as string | null,
        inversionTiktok: inversionTiktok as string | null,
        picoCpl1,
        picoCpl2,
        picoCpl3,
        picoCpl4,
        fuente,
        notas: data.notas?.trim() || null,
      };

      // One row per project, so saving replaces: the runbook's "correcting a
      // load" is re-opening the same block and overwriting it.
      await db
        .insert(metricaHistorica)
        .values(values)
        .onDuplicateKeyUpdate({
          set: {
            desde: values.desde,
            hasta: values.hasta,
            registros: values.registros,
            encuestas: values.encuestas,
            grupos: values.grupos,
            vip: values.vip,
            organicos: values.organicos,
            leadsApi: values.leadsApi,
            inversionMeta: values.inversionMeta,
            inversionGoogle: values.inversionGoogle,
            inversionTiktok: values.inversionTiktok,
            picoCpl1: values.picoCpl1,
            picoCpl2: values.picoCpl2,
            picoCpl3: values.picoCpl3,
            picoCpl4: values.picoCpl4,
            fuente: values.fuente,
            notas: values.notas,
          },
        });

      const saved = await findHistoricalByProjectId(data.projectId);
      if (!saved) return { ok: false, error: es.errors.generic };

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.historical.saved',
        targetType: 'project',
        targetId: String(data.projectId),
        metadata: values,
      });

      return { ok: true, historical: saved };
    } catch (err) {
      logServerError('saveProjectHistorical', { projectId: data.projectId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deleteProjectHistorical = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }): Promise<HistoricalMutationResult> => {
    try {
      const { session, headers } = await assertProjectPermission('projects:write', data.projectId);

      const current = await findHistoricalByProjectId(data.projectId);
      if (!current) return { ok: false, error: es.projects.historicalNotFound };

      await db.delete(metricaHistorica).where(eq(metricaHistorica.proyectoId, data.projectId));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.historical.deleted',
        targetType: 'project',
        targetId: String(data.projectId),
        metadata: { desde: current.desde, hasta: current.hasta, fuente: current.fuente },
      });

      return { ok: true, historical: null };
    } catch (err) {
      logServerError('deleteProjectHistorical', { projectId: data.projectId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// VIP access sales for a project, read from `achievers-comercial-system` via its
// `public-project-metrics` Edge Function (see docs/ventas-vip.md). That system
// owns the sales, so the dashboard only needs the sales-system code and the
// product id; `groupBy=dia` adds the daily breakdown the timeline chart draws.
//
// Since ACS-63 that code addresses a MODALIDAD (`lanzamiento`, `evergreen`...),
// which is coarser than the old project: a modalidad holds every edition ever
// sold under it. What isolates one launch is the dash date range plus the VIP
// product id, so both totals below stay scoped by product, never by the
// `cantidad_ventas` of the modalidad as a whole.
type SalesProductMetric = {
  producto_id?: unknown;
  producto_nombre?: unknown;
  cantidad_ventas?: unknown;
};

// Mirrors the phone normalization used across the dashboard: digits only, with
// Argentina's `549…` and `54…` treated as the same number.
function normalizePhoneValue(value: string | null) {
  const digits = (value ?? '').replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.startsWith('549')) return `54${digits.slice(3)}`;
  return digits;
}

// The VIP conversion denominator: unique phones that entered a group inside the
// range and had not left it by the time the range closed. Counting every entry
// would keep people who walked out in the denominator and report the rate lower
// than it is (ADR 0016), so the net over `(telefono, grupo)` is taken first and
// the phones are de-duplicated after — someone in three groups is one lead.
async function countUniqueGroupPhones(projectId: number, dateStart: string, dateEnd: string) {
  const rows = await db
    .select({
      telefono: grupo.telefono,
      entradasEnRango: sql<string>`sum(case when ${grupo.evento} = 'entrada' and date(${grupo.fecha}) between ${dateStart} and ${dateEnd} then 1 else 0 end)`,
      neto: sql<string>`sum(case when ${grupo.evento} = 'entrada' then 1 else -1 end)`,
    })
    .from(grupo)
    .where(and(eq(grupo.proyectoId, projectId), sql`date(${grupo.fecha}) <= ${dateEnd}`))
    .groupBy(grupo.telefono, grupo.grupo);

  const phones = new Set<string>();
  for (const row of rows) {
    if (Number(row.entradasEnRango) <= 0 || Number(row.neto) <= 0) continue;
    const phone = normalizePhoneValue(row.telefono);
    if (phone) phones.add(phone);
  }

  return phones.size;
}

function readCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function findProductMetric(value: unknown, productId: string): SalesProductMetric | null {
  if (!Array.isArray(value)) return null;
  return (value as SalesProductMetric[]).find((item) => item?.producto_id === productId) ?? null;
}

// The modalidad / edicion catalogue of `achievers-comercial-system`, so the
// project form can offer two dropdowns instead of asking for a UUID typed by
// hand. The list lives there, not here (`?modalidades=1`): a modalidad created
// in that system shows up on the next open, with nothing to change on this side.
export type SalesModalidad = {
  id: string;
  // Nullable there too. A modalidad without a code cannot be requested by
  // `projectCode`, so the form has to show it as unusable rather than hide it
  // and leave someone wondering why it is missing.
  codigo: string | null;
  nombre: string;
  activa: boolean;
  usaEdicion: boolean;
  ediciones: Array<{ id: string; nombre: string; activa: boolean }>;
};

export type SalesModalidadesResult =
  | { status: 'success'; modalidades: SalesModalidad[] }
  | { status: 'not-configured'; message: string }
  | { status: 'error'; message: string };

export const fetchSalesModalidades = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SalesModalidadesResult> => {
    await assertPermission('projects:write');

    if (!env.SALES_METRICS_API_KEY) {
      return { status: 'not-configured', message: es.projects.vipSalesMissingKey };
    }

    try {
      const url = new URL(env.SALES_METRICS_URL);
      url.searchParams.set('modalidades', '1');

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'x-api-key': env.SALES_METRICS_API_KEY },
      });

      if (!response.ok) {
        return { status: 'error', message: es.projects.vipSalesModalidadesFailed };
      }

      const payload = (await response.json()) as {
        data?: { modalidades?: unknown };
      };

      const raw = Array.isArray(payload.data?.modalidades) ? payload.data.modalidades : [];
      const modalidades: SalesModalidad[] = [];

      for (const item of raw as Array<Record<string, unknown>>) {
        if (typeof item?.id !== 'string' || typeof item.nombre !== 'string') continue;
        const ediciones = Array.isArray(item.ediciones) ? item.ediciones : [];

        modalidades.push({
          id: item.id,
          codigo: typeof item.codigo === 'string' ? item.codigo : null,
          nombre: item.nombre,
          activa: item.activa !== false,
          usaEdicion: item.usa_edicion === true,
          ediciones: (ediciones as Array<Record<string, unknown>>)
            .filter(
              (edicion) => typeof edicion?.id === 'string' && typeof edicion.nombre === 'string',
            )
            .map((edicion) => ({
              id: edicion.id as string,
              nombre: edicion.nombre as string,
              activa: edicion.activa !== false,
            })),
        });
      }

      return { status: 'success', modalidades };
    } catch (err) {
      logServerError('fetchSalesModalidades', {}, err);
      return { status: 'error', message: es.projects.vipSalesModalidadesFailed };
    }
  },
);

export const fetchProjectVipSales = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number; dateStart: string; dateEnd: string }) => data)
  .handler(async ({ data }): Promise<ProjectVipSalesResult> => {
    await assertProjectPermission('projects:read', data.projectId);

    const current = await findProjectById(data.projectId);
    if (!current) return { status: 'error', message: es.projects.notFound };
    if (!current.salesProjectCode || !current.vipProductId) {
      return { status: 'not-configured', message: es.projects.vipSalesNotConfigured };
    }
    if (!env.SALES_METRICS_API_KEY) {
      return { status: 'error', message: es.projects.vipSalesMissingKey };
    }
    if (!data.dateStart || !data.dateEnd) {
      return { status: 'error', message: es.projects.vipSalesFetchFailed };
    }

    const productId = current.vipProductId;

    try {
      const leadsInGroups = await countUniqueGroupPhones(
        data.projectId,
        data.dateStart,
        data.dateEnd,
      );

      const url = new URL(env.SALES_METRICS_URL);
      // The parameter is still called `projectCode`, but since ACS-63 it resolves
      // against `modalidades`: the value is a modalidad code (`lanzamiento`,
      // `MOD-00100`...), not the old `PRY-00000`. See docs/ventas-vip.md.
      url.searchParams.set('projectCode', current.salesProjectCode);
      url.searchParams.set('dateStart', data.dateStart);
      url.searchParams.set('dateEnd', data.dateEnd);
      url.searchParams.set('groupBy', 'dia');
      // Only the two blocks this card reads. Without `incluir` the function also
      // computes `cobranza`, which scans every pending instalment in the system
      // and is not shown here.
      url.searchParams.set('incluir', 'productos,dias');
      const editionId = current.salesEditionId;
      if (editionId) url.searchParams.set('edicionId', editionId);

      const response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'x-api-key': env.SALES_METRICS_API_KEY },
      });

      if (!response.ok) {
        // The function answers 404 when the project code matches nothing there.
        return {
          status: 'error',
          message:
            response.status === 404
              ? es.projects.vipSalesProjectNotFound
              : es.projects.vipSalesFetchFailed,
        };
      }

      const payload = (await response.json()) as {
        data?: {
          // `proyecto` is what the function answered before ACS-63; it is kept as
          // a fallback so a not-yet-deployed version of the endpoint still names
          // the source correctly.
          modalidad?: { codigo?: unknown; nombre?: unknown };
          proyecto?: { codigo?: unknown; nombre?: unknown };
          metricas?: { ventas_por_producto?: unknown; ventas_por_dia?: unknown };
        };
        meta?: { filters?: { edicionId?: unknown } };
      };

      const proyecto = payload.data?.modalidad ?? payload.data?.proyecto;
      const editionFilterApplied = !editionId || payload.meta?.filters?.edicionId === editionId;
      const metricas = payload.data?.metricas;
      const productMetric = findProductMetric(metricas?.ventas_por_producto, productId);
      const rawDays = Array.isArray(metricas?.ventas_por_dia) ? metricas.ventas_por_dia : [];

      const daily: ProjectVipSalesDay[] = [];
      for (const rawDay of rawDays as Array<Record<string, unknown>>) {
        const fechaKey = typeof rawDay.fecha === 'string' ? rawDay.fecha : null;
        if (!fechaKey) continue;
        const dayMetric = findProductMetric(rawDay.ventas_por_producto, productId);
        const count = readCount(dayMetric?.cantidad_ventas);
        if (count > 0) daily.push({ fechaKey, count });
      }

      return {
        status: 'success',
        sales: {
          projectCode:
            typeof proyecto?.codigo === 'string' ? proyecto.codigo : current.salesProjectCode,
          projectName: typeof proyecto?.nombre === 'string' ? proyecto.nombre : '',
          editionId,
          editionFilterApplied,
          productId,
          productName:
            typeof productMetric?.producto_nombre === 'string'
              ? productMetric.producto_nombre
              : null,
          dateStart: data.dateStart,
          dateEnd: data.dateEnd,
          count: readCount(productMetric?.cantidad_ventas),
          daily,
          leadsInGroups,
        },
      };
    } catch (err) {
      logServerError('fetchProjectVipSales', { projectId: data.projectId }, err);
      return { status: 'error', message: es.projects.vipSalesFetchFailed };
    }
  });

export const importProjectCsvRows = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      projectId: number;
      target: CsvImportTarget;
      mappings: CsvImportMapping[];
      rows: Record<string, string>[];
    }) => data,
  )
  .handler(async ({ data }): Promise<CsvImportResult> => {
    try {
      const { session, headers } = await assertProjectPermission('projects:write', data.projectId);
      const currentProject = await findProjectById(data.projectId);
      if (!currentProject) return { ok: false, error: es.projects.notFound };

      const errors: string[] = [];
      let created = 0;

      if (data.rows.length === 0) {
        return { ok: false, error: es.projects.importEmptyFile };
      }

      for (const [index, row] of data.rows.entries()) {
        const rowNumber = index + 2;
        const plan = buildImportPlan(data.mappings, row);

        if (data.target === 'registros') {
          const nombre = normalizeNullableString(plan.fields.nombre);
          const correo = normalizeNullableString(plan.fields.correo)?.toLowerCase() ?? null;
          const telefono = normalizeNullableString(plan.fields.telefono);
          const origen =
            normalizeNullableString(plan.fields.origen) ??
            (typeof plan.metadata.origen === 'string'
              ? normalizeNullableString(plan.metadata.origen)
              : null) ??
            'Sin origen';

          if (!nombre) {
            addImportError(errors, rowNumber, 'falta el campo nombre.');
            continue;
          }

          if (!correo) {
            addImportError(errors, rowNumber, 'falta el campo correo.');
            continue;
          }

          const [createdId] = await db
            .insert(registro)
            .values({
              proyectoId: data.projectId,
              nombre,
              correo,
              telefono,
              origen,
              metadata: plan.metadata,
            })
            .$returningId();

          if (!createdId) {
            addImportError(errors, rowNumber, 'no se pudo crear el registro.');
            continue;
          }

          created += 1;
          continue;
        }

        if (data.target === 'encuestas') {
          const correo = normalizeNullableString(plan.fields.correo)?.toLowerCase() ?? null;
          let contactId = normalizeNullableString(plan.fields.contactId);
          const scoreText = normalizeNullableString(plan.fields.score);
          const score =
            scoreText === null
              ? null
              : Number.isFinite(Number(scoreText))
                ? Number(scoreText)
                : Number.NaN;

          if (scoreText !== null && !Number.isFinite(score)) {
            addImportError(errors, rowNumber, 'el score no es valido.');
            continue;
          }

          if (!contactId && correo) {
            contactId = await resolveEncuestaContactId(data.projectId, correo);
          }

          if (!contactId) {
            addImportError(
              errors,
              rowNumber,
              'la encuesta necesita contactId o un correo que apunte a un registro del proyecto.',
            );
            continue;
          }

          const [createdId] = await db
            .insert(encuesta)
            .values({
              proyectoId: data.projectId,
              contactId,
              respuestas: plan.respuestas,
              score: scoreText === null ? null : Number(scoreText),
            })
            .$returningId();

          if (!createdId) {
            addImportError(errors, rowNumber, 'no se pudo crear la encuesta.');
            continue;
          }

          created += 1;
          continue;
        }

        const telefono = normalizeNullableString(plan.fields.telefono);
        const campana = normalizeNullableString(plan.fields.campana);
        const grupoNombre = normalizeNullableString(plan.fields.grupo);
        const fechaText = normalizeNullableString(plan.fields.fecha);
        const fecha = fechaText ? parseImportDate(fechaText) : null;

        if (!telefono || !campana || !grupoNombre || !fecha) {
          addImportError(
            errors,
            rowNumber,
            'el grupo necesita telefono, campana, grupo y una fecha valida.',
          );
          continue;
        }

        const [createdId] = await db
          .insert(grupo)
          .values({
            proyectoId: data.projectId,
            telefono,
            campana,
            grupo: grupoNombre,
            fecha,
          })
          .$returningId();

        if (!createdId) {
          addImportError(errors, rowNumber, 'no se pudo crear el grupo.');
          continue;
        }

        created += 1;
      }

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: `project.${data.target}.csv_imported`,
        targetType: 'project',
        targetId: String(data.projectId),
        metadata: {
          projectName: currentProject.nombre,
          target: data.target,
          created,
          skipped: errors.length,
          mappedColumns: data.mappings.filter((mapping) => mapping.kind !== 'ignore').length,
        },
      });

      return { ok: true, created, skipped: errors.length, errors: errors.slice(0, 20) };
    } catch (err) {
      logServerError(
        'importProjectCsvRows',
        { projectId: data.projectId, target: data.target, rowCount: data.rows.length },
        err,
      );
      return { ok: false, error: es.errors.generic };
    }
  });

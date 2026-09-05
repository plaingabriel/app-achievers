import { db } from '@/db/index';
import {
  metricsAcsVentasDiarias,
  metricsAcsVentasProductoDiarias,
  metricsEncuestasDiarias,
  metricsEncuestasDiariasPorOrigen,
  metricsGruposPorCampana,
  metricsMetaAdsDiarias,
  metricsProyectos,
  metricsRegistrosDiarios,
} from '@/db/metrics-views';
import { encuesta, grupo, project, registro } from '@/db/schema/index';
import { recordAudit } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { logError } from '@/lib/error-log';
import { resolveAccess } from '@/lib/rbac';
import { type AnyColumn, and, avg, count, desc, eq, isNotNull, sql } from 'drizzle-orm';

type JsonObject = Record<string, unknown>;
type ApiLogContext = Record<string, unknown>;
type HeaderMap = Record<string, string>;
type PublicStatsGroupField =
  | { field: keyof typeof PUBLIC_STATS_GROUPABLE_COLUMNS; kind: 'column' }
  | { field: `metadata.${string}`; kind: 'metadata'; metadataKey: string };

const PROJECT_SELECT = {
  id: project.id,
  nombre: project.nombre,
  createdAt: project.createdAt,
};

const REGISTRO_SELECT = {
  id: registro.id,
  proyectoId: registro.proyectoId,
  nombre: registro.nombre,
  correo: registro.correo,
  telefono: registro.telefono,
  metadata: registro.metadata,
  origen: registro.origen,
  createdAt: registro.createdAt,
};

const GRUPO_SELECT = {
  id: grupo.id,
  proyectoId: grupo.proyectoId,
  telefono: grupo.telefono,
  campana: grupo.campana,
  grupo: grupo.grupo,
  fecha: grupo.fecha,
  createdAt: grupo.createdAt,
};

const ENCUESTA_SELECT = {
  id: encuesta.id,
  proyectoId: encuesta.proyectoId,
  contactId: encuesta.contactId,
  respuestas: encuesta.respuestas,
  score: encuesta.score,
  createdAt: encuesta.createdAt,
};

const REGISTRO_DIRECT_KEYS = new Set([
  'proyectoId',
  'nombre',
  'correo',
  'email',
  'telefono',
  'origen',
  'metadata',
]);
const ENCUESTA_DIRECT_KEYS = new Set([
  'proyectoId',
  'contactId',
  'contact_id',
  'respuestas',
  'score',
  'nombre',
  'name',
  'correo',
  'email',
  'telefono',
  'phone',
]);
const PUBLIC_INGEST_ALLOWED_ORIGINS = new Set([
  'https://achievers.es',
  'https://www.achievers.es',
  'https://server.achieversacademy.es',
  'https://desafioimportador.com',
  'https://www.desafioimportador.com',
]);
const PUBLIC_STATS_GROUPABLE_COLUMNS = {
  nombre: registro.nombre,
  correo: registro.correo,
  telefono: registro.telefono,
  origen: registro.origen,
} as const;

function formFieldKey(key: string) {
  return `form_fields[${key}]`;
}

function readBodyValue(body: JsonObject, key: string) {
  if (body[key] !== undefined) return body[key];
  return body[formFieldKey(key)];
}

function readBodyValueByKeys(body: JsonObject, keys: string[]) {
  for (const key of keys) {
    const value = readBodyValue(body, key);
    if (value !== undefined) return value;
  }
  return undefined;
}

function hasBodyValue(body: JsonObject, key: string) {
  return readBodyValue(body, key) !== undefined;
}

function readRegistroBodyValue(body: JsonObject, key: string) {
  switch (key) {
    case 'correo':
      return readBodyValueByKeys(body, ['correo', 'email']);
    default:
      return readBodyValue(body, key);
  }
}

function hasRegistroBodyValue(body: JsonObject, key: string) {
  return readRegistroBodyValue(body, key) !== undefined;
}

function readNestedObjectValue(body: JsonObject, objectKey: string, keys: string[]) {
  const nested = body[objectKey];
  if (!isPlainObject(nested)) return undefined;

  for (const key of keys) {
    if (nested[key] !== undefined) return nested[key];
  }

  return undefined;
}

function readGrupoBodyValue(body: JsonObject, key: string) {
  const directValue = readBodyValue(body, key);
  if (directValue !== undefined) return directValue;

  switch (key) {
    case 'telefono':
      return readNestedObjectValue(body, 'data', ['number']);
    case 'campana':
      return readNestedObjectValue(body, 'data', ['campaignName']);
    case 'grupo':
      return readNestedObjectValue(body, 'data', ['groupName']);
    case 'fecha':
      return readNestedObjectValue(body, 'data', ['createdAt_with_timezone_br', 'createdAt']);
    default:
      return undefined;
  }
}

function hasGrupoBodyValue(body: JsonObject, key: string) {
  return readGrupoBodyValue(body, key) !== undefined;
}

function readEncuestaBodyValue(body: JsonObject, key: string) {
  switch (key) {
    case 'contactId':
      return readBodyValueByKeys(body, ['contactId', 'contact_id']);
    case 'score':
      return readBodyValueByKeys(body, ['score']);
    case 'email':
      return readBodyValueByKeys(body, ['email', 'correo']);
    default:
      return readBodyValue(body, key);
  }
}

function hasEncuestaBodyValue(body: JsonObject, key: string) {
  return readEncuestaBodyValue(body, key) !== undefined;
}

function isRegistroDirectKey(key: string) {
  return REGISTRO_DIRECT_KEYS.has(key) || REGISTRO_DIRECT_KEYS.has(readFormFieldName(key) ?? '');
}

function isEncuestaDirectKey(key: string) {
  return ENCUESTA_DIRECT_KEYS.has(key) || ENCUESTA_DIRECT_KEYS.has(readFormFieldName(key) ?? '');
}

function readFormFieldName(key: string) {
  const match = /^form_fields\[(.+)\]$/.exec(key);
  return match?.[1] ?? null;
}

function buildCorsHeaders(origin: string): HeaderMap {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

function getAllowedPublicOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  return PUBLIC_INGEST_ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function getCorsHeadersForRequest(request: Request) {
  const origin = getAllowedPublicOrigin(request);
  return origin ? buildCorsHeaders(origin) : {};
}

function assertPublicIngestOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  if (PUBLIC_INGEST_ALLOWED_ORIGINS.has(origin)) return;
  throw new ApiError(`Origin no permitido: ${origin}`, 403);
}

function truncateForLog(value: string, max = 1200) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return truncateForLog(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= 4) return '[truncated]';

  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item, depth + 1));
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 50);
    return Object.fromEntries(entries.map(([key, item]) => [key, sanitizeForLog(item, depth + 1)]));
  }

  return String(value);
}

async function readRequestBodyForLog(request: Request) {
  if (request.method === 'GET' || request.method === 'DELETE' || request.method === 'HEAD') {
    return null;
  }

  const contentType = request.headers.get('content-type') ?? '';
  const clone = request.clone();

  if (contentType.includes('application/json')) {
    try {
      return sanitizeForLog(await clone.json());
    } catch {
      try {
        const raw = await clone.text();
        return raw ? { rawBody: truncateForLog(raw), parseError: 'invalid-json' } : null;
      } catch {
        return { parseError: 'unreadable-body' };
      }
    }
  }

  try {
    const raw = await clone.text();
    return raw ? { rawBody: truncateForLog(raw), contentType } : null;
  } catch {
    return { parseError: 'unreadable-body', contentType };
  }
}

export async function captureApiRequestContext(request: Request): Promise<ApiLogContext> {
  const url = new URL(request.url);
  const query = Object.fromEntries(url.searchParams.entries());
  const payload = await readRequestBodyForLog(request);

  return {
    method: request.method,
    pathname: url.pathname,
    query,
    contentType: request.headers.get('content-type'),
    payload,
  };
}

export async function logApiRequest(action: string, context: ApiLogContext) {
  await logError({
    level: 'info',
    message: `${action}: request received`,
    source: action,
    metadata: sanitizeForLog(context) as Record<string, unknown>,
  });
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200, headers?: HeaderMap) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

export function createCorsPreflightResponse(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) {
    return new Response(null, { status: 204 });
  }

  if (!PUBLIC_INGEST_ALLOWED_ORIGINS.has(origin)) {
    return json({ error: `Origin no permitido: ${origin}` }, 403);
  }

  return new Response(null, {
    status: 204,
    headers: buildCorsHeaders(origin),
  });
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError('Body JSON inválido.', 400);
    }

    if (!isPlainObject(body)) {
      throw new ApiError('El body debe ser un objeto JSON.', 400);
    }

    return body;
  }

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const formData = await request.formData();
      return formDataToObject(formData);
    } catch {
      throw new ApiError('Body de formulario inválido.', 400);
    }
  }

  try {
    const body = await request.json();
    if (!isPlainObject(body)) {
      throw new ApiError('El body debe ser un objeto JSON.', 400);
    }
    return body;
  } catch {
    throw new ApiError('Content-Type no soportado. Usa JSON o formulario.', 400);
  }
}

function formDataToObject(formData: FormData): JsonObject {
  const body: JsonObject = {};

  for (const [key, value] of formData.entries()) {
    body[key] = typeof value === 'string' ? value : value.name;
  }

  return body;
}

function readRequiredString(body: JsonObject, key: string) {
  const value = readBodyValue(body, key);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(`El campo "${key}" es obligatorio.`, 400);
  }
  return value.trim();
}

function readOptionalString(body: JsonObject, key: string) {
  const value = readBodyValue(body, key);
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new ApiError(`El campo "${key}" debe ser texto.`, 400);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalAliasString(value: unknown, key: string) {
  return readOptionalString({ [key]: value }, key);
}

function readOptionalObjectString(value: unknown, key: string) {
  if (!isPlainObject(value)) return null;
  return readOptionalAliasString(value[key], key);
}

function readOptionalNumber(value: unknown, key: string) {
  if (value === undefined || value === null || value === '') return null;

  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(`El campo "${key}" debe ser un entero positivo.`, 400);
  }

  return parsed;
}

function readOptionalFloat(value: unknown, key: string) {
  if (value === undefined || value === null || value === '') return null;

  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    throw new ApiError(`El campo "${key}" debe ser un número válido.`, 400);
  }

  return parsed;
}

function readRequiredDate(body: JsonObject, key: string) {
  const value = readBodyValue(body, key);
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(`El campo "${key}" es obligatorio.`, 400);
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(`El campo "${key}" debe ser una fecha válida.`, 400);
  }

  return parsed;
}

function readProjectIdFromRequest(request: Request, body: JsonObject) {
  const url = new URL(request.url);
  return readOptionalNumber(
    readBodyValue(body, 'proyectoId') ?? url.searchParams.get('proyectoId'),
    'proyectoId',
  );
}

function readPublicStatsGroupField(request: Request): PublicStatsGroupField {
  const url = new URL(request.url);
  const field = url.searchParams.get('field')?.trim() || 'origen';

  if (field in PUBLIC_STATS_GROUPABLE_COLUMNS) {
    return {
      field: field as keyof typeof PUBLIC_STATS_GROUPABLE_COLUMNS,
      kind: 'column',
    };
  }

  const metadataMatch = /^metadata\.([A-Za-z0-9_-]+)$/.exec(field);
  if (metadataMatch) {
    const metadataKey = metadataMatch[1];
    if (!metadataKey) {
      throw new ApiError('El par\u00e1metro "field" no es v\u00e1lido.', 400);
    }
    return {
      field: field as `metadata.${string}`,
      kind: 'metadata',
      metadataKey,
    };
  }

  throw new ApiError(
    'El par\u00e1metro "field" no es v\u00e1lido. Usa una columna soportada o metadata.<clave>.',
    400,
  );
}

function formatPublicStatsValue(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'Sin valor';
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return 'Sin valor';
}

function readGroupLabelFromRegistroRow(
  row: {
    id?: number;
    nombre: string;
    correo: string;
    telefono: string | null;
    origen: string;
    metadata: unknown;
  },
  groupField: PublicStatsGroupField,
) {
  if (groupField.kind === 'column') {
    return formatPublicStatsValue(row[groupField.field]);
  }

  if (!isPlainObject(row.metadata)) return 'Sin valor';
  return formatPublicStatsValue(row.metadata[groupField.metadataKey]);
}

function readMetadata(body: JsonObject) {
  const metadata: JsonObject = {};
  const explicit = readBodyValue(body, 'metadata');

  if (explicit !== undefined) {
    if (!isPlainObject(explicit)) {
      throw new ApiError('El campo "metadata" debe ser un objeto JSON.', 400);
    }
    Object.assign(metadata, explicit);
  }

  for (const [key, value] of Object.entries(body)) {
    if (!isRegistroDirectKey(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
}

function readRegistroOrigin(body: JsonObject, fallback = 'Sin origen') {
  return (
    readOptionalString(body, 'origen') ??
    readOptionalString(body, 'utm_content') ??
    readOptionalObjectString(readBodyValue(body, 'metadata'), 'origen') ??
    readOptionalObjectString(readBodyValue(body, 'metadata'), 'utm_content') ??
    fallback
  );
}

function readRespuestas(body: JsonObject) {
  const respuestas: JsonObject = {};
  const explicit = readEncuestaBodyValue(body, 'respuestas');

  if (explicit !== undefined) {
    if (!isPlainObject(explicit)) {
      throw new ApiError('El campo "respuestas" debe ser un objeto JSON.', 400);
    }
    Object.assign(respuestas, explicit);
  }

  for (const [key, value] of Object.entries(body)) {
    if (!isEncuestaDirectKey(key)) {
      respuestas[key] = value;
    }
  }

  return respuestas;
}

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) throw new ApiError('No autenticado.', 401);

  const access = await resolveAccess(session.user.id);
  if (!access.isAdmin) throw new ApiError('Sin permiso.', 403);

  return { session, headers: request.headers };
}

function readApiKeyFromRequest(request: Request) {
  const headerKey = request.headers.get('x-api-key');
  if (headerKey) return headerKey;

  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

function requirePublicStatsApiKey(request: Request) {
  if (!env.PUBLIC_STATS_API_KEY) {
    throw new ApiError('PUBLIC_STATS_API_KEY no configurada.', 503);
  }

  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) throw new ApiError('Falta la API key.', 401);
  if (apiKey !== env.PUBLIC_STATS_API_KEY) throw new ApiError('API key inv\u00e1lida.', 403);
}

async function findProjectById(id: number) {
  const [row] = await db.select(PROJECT_SELECT).from(project).where(eq(project.id, id)).limit(1);
  return row ?? null;
}

async function findRegistroById(id: number) {
  const [row] = await db.select(REGISTRO_SELECT).from(registro).where(eq(registro.id, id)).limit(1);
  return row ?? null;
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
  if (!linkedRegistro) {
    throw new ApiError('No existe un registro para ese correo en este proyecto.', 404);
  }

  return String(linkedRegistro.id);
}

async function findGrupoById(id: number) {
  const [row] = await db.select(GRUPO_SELECT).from(grupo).where(eq(grupo.id, id)).limit(1);
  return row ?? null;
}

async function findEncuestaById(id: number) {
  const [row] = await db.select(ENCUESTA_SELECT).from(encuesta).where(eq(encuesta.id, id)).limit(1);
  return row ?? null;
}

export async function listProjects(request: Request) {
  await requireAdmin(request);
  const proyectos = await db.select(PROJECT_SELECT).from(project).orderBy(project.nombre);
  return json({ proyectos });
}

export async function getProject(request: Request, projectId: number) {
  await requireAdmin(request);
  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);
  return json({ proyecto });
}

export async function getPublicProjectOrigins(request: Request, projectId: number) {
  requirePublicStatsApiKey(request);

  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const rows = await db
    .select({
      id: registro.id,
      nombre: registro.nombre,
      correo: registro.correo,
      telefono: registro.telefono,
      origen: registro.origen,
      metadata: registro.metadata,
    })
    .from(registro)
    .where(eq(registro.proyectoId, projectId));

  const groupField = readPublicStatsGroupField(request);
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = readGroupLabelFromRegistroRow(row, groupField);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const origins = Object.fromEntries(
    [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value]),
  );
  return json(origins);
}

export async function getPublicProjectAverageScore(request: Request, projectId: number) {
  requirePublicStatsApiKey(request);

  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const registros = await db
    .select({
      id: registro.id,
      nombre: registro.nombre,
      correo: registro.correo,
      telefono: registro.telefono,
      origen: registro.origen,
      metadata: registro.metadata,
    })
    .from(registro)
    .where(eq(registro.proyectoId, projectId));

  const encuestasRows = await db
    .select({
      score: encuesta.score,
      contactId: encuesta.contactId,
    })
    .from(encuesta)
    .where(and(eq(encuesta.proyectoId, projectId), sql`${encuesta.score} IS NOT NULL`));

  const groupField = readPublicStatsGroupField(request);
  const registrosById = new Map(registros.map((row) => [String(row.id), row] as const));
  const totals = new Map<string, { total: number; count: number }>();
  for (const row of encuestasRows) {
    if (row.score === null) continue;
    const registroRow = registrosById.get(row.contactId);
    if (!registroRow) continue;
    const label = readGroupLabelFromRegistroRow(registroRow, groupField);
    const current = totals.get(label) ?? { total: 0, count: 0 };
    totals.set(label, {
      total: current.total + Number(row.score),
      count: current.count + 1,
    });
  }

  const averages = Object.fromEntries(
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value.count > 0 ? value.total / value.count : null]),
  );

  return json(averages);
}

export async function getPublicProjectGroupedSummary(request: Request, projectId: number) {
  requirePublicStatsApiKey(request);

  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const groupField = readPublicStatsGroupField(request);

  const registroRows = await db
    .select({
      id: registro.id,
      nombre: registro.nombre,
      correo: registro.correo,
      telefono: registro.telefono,
      origen: registro.origen,
      metadata: registro.metadata,
    })
    .from(registro)
    .where(eq(registro.proyectoId, projectId));

  const scoreRows = await db
    .select({
      score: encuesta.score,
      contactId: encuesta.contactId,
    })
    .from(encuesta)
    .where(and(eq(encuesta.proyectoId, projectId), sql`${encuesta.score} IS NOT NULL`));

  const summaryMap = new Map<
    string,
    {
      cantidad: number;
      scorePromedio: number | null;
    }
  >();

  for (const row of registroRows) {
    const label = readGroupLabelFromRegistroRow(row, groupField);
    const current = summaryMap.get(label) ?? { cantidad: 0, scorePromedio: null };
    summaryMap.set(label, {
      cantidad: current.cantidad + 1,
      scorePromedio: current.scorePromedio,
    });
  }

  const scoreAccumulator = new Map<string, { total: number; count: number }>();
  const registrosById = new Map(registroRows.map((row) => [String(row.id), row] as const));
  for (const row of scoreRows) {
    if (row.score === null) continue;
    const registroRow = registrosById.get(row.contactId);
    if (!registroRow) continue;
    const label = readGroupLabelFromRegistroRow(registroRow, groupField);
    const current = scoreAccumulator.get(label) ?? { total: 0, count: 0 };
    scoreAccumulator.set(label, {
      total: current.total + Number(row.score),
      count: current.count + 1,
    });
  }

  for (const [label, value] of scoreAccumulator.entries()) {
    const current = summaryMap.get(label) ?? { cantidad: 0, scorePromedio: null };
    summaryMap.set(label, {
      cantidad: current.cantidad,
      scorePromedio: value.count > 0 ? value.total / value.count : null,
    });
  }

  const summary = Object.fromEntries(
    [...summaryMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => [key, value]),
  );

  return json({
    proyectoId: projectId,
    field: groupField.field,
    grupos: summary,
  });
}

// --- Time series for the external metrics panel ------------------------------
//
// The panel runs on Railway, where the SSH tunnel of
// docs/runbooks/metrics-db-user.md is not an option: MySQL listens on 127.0.0.1
// and Railway's egress IP is shared between customers, so neither a direct
// connection nor an IP allowlist works. This endpoint is the HTTPS door to the
// very same `Metricas` views, so the same day drawn in the panel and in the
// dashboard cannot disagree. Every value served here comes from those views:
// `Evergreen` is touched only by the `findProjectById` that turns an unknown
// `proyectoId` into a 404, never to compute a number.

const METRICS_SERIES_DEFAULT_DAYS = 90;
const METRICS_SERIES_MAX_DAYS = 366;
const METRICS_SERIES_UNKNOWN_ORIGIN = 'Sin origen';

// A project counts as active if it has moved recently, or if it is too new to
// have moved at all: a project created today has no registro and would otherwise
// be listed as inactive, which is exactly the case the catalogue exists to serve.
const METRICS_PROJECT_ACTIVE_DAYS = 30;

// The catalogue the panel reads from /api/public/metricas, and the same list
// `?metrica=` is validated against — one definition, so a metric cannot be
// advertised and then rejected. Adding one here is what makes it appear in the
// panel; see docs/runbooks/metrics-db-user.md, section 6.
//
// `agregacion` says how to fold several days into one number, `mejor` which
// direction is good, and `agrupaciones` which values `?agrupar=` accepts for
// that metric — the grupos series is not broken down by origin, so asking for it
// is a 400 rather than a silently ungrouped answer.
//
// Deliberately absent: `telefonos_unicos` from `v_grupos_por_campana`. It is a
// distinct count, so adding two days (or two campaigns within a day) double
// counts a phone present in both, and no value of `agregacion` describes that
// honestly. A metric that cannot be folded correctly does not belong in a
// catalogue whose whole point is that the panel can fold it.
const METRICS_CATALOG = [
  {
    id: 'registros',
    nombre: 'Leads registrados',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion: 'Altas de registro por día.',
    agrupaciones: ['origen'],
  },
  {
    id: 'encuestas',
    nombre: 'Encuestas Lead Score',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion: 'Encuestas respondidas por día.',
    agrupaciones: ['origen'],
  },
  {
    id: 'score',
    nombre: 'Lead Score promedio',
    unidad: 'cantidad',
    agregacion: 'promedio',
    mejor: 'alto',
    descripcion: 'Media de la puntuación de las encuestas del día.',
    agrupaciones: ['origen'],
  },
  {
    id: 'grupos',
    nombre: 'Leads en grupos de WSP',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion: 'Asignaciones a grupos por día de la fecha de la campaña, no de su alta.',
    agrupaciones: [],
  },
  {
    id: 'inversion_meta',
    nombre: 'Inversión Meta',
    unidad: 'usd',
    agregacion: 'suma',
    mejor: 'bajo',
    descripcion: 'Gasto en anuncios de Meta por día.',
    agrupaciones: ['campana'],
  },
  {
    id: 'clics_meta',
    nombre: 'Clics en anuncios Meta',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion: 'Clics en el enlace del anuncio, según Meta.',
    agrupaciones: ['campana'],
  },
  {
    id: 'landing_views_meta',
    nombre: 'Visitas a la landing desde Meta',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion: 'Cargas de la landing atribuidas al anuncio, según Meta.',
    agrupaciones: ['campana'],
  },
  {
    id: 'registros_meta',
    nombre: 'Registros completados (píxel de Meta)',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Lo que cuenta el píxel de Meta, no la base: no coincide con "registros" y no debe presentarse como la misma cifra.',
    agrupaciones: ['campana'],
  },
  {
    id: 'leads_meta',
    nombre: 'Leads (píxel de Meta)',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Lo que cuenta el píxel de Meta, no la base: suele quedar por encima de "registros" por atribución y disparos repetidos.',
    agrupaciones: ['campana'],
  },
  {
    id: 'ventas_acs',
    nombre: 'Ventas (sistema comercial)',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Ventas abiertas por día en el sistema comercial. Una venta en cuotas cuenta UNA vez, el día que se abre; sus cuotas posteriores son "cobros_acs".',
    agrupaciones: ['producto'],
  },
  {
    id: 'cobros_acs',
    nombre: 'Cobros (sistema comercial)',
    unidad: 'cantidad',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Pagos completados por día, incluidas las cuotas de ventas anteriores. Puede superar a "ventas_acs" y no admite desglose por producto: una cuota no dice qué producto abrió la venta.',
    agrupaciones: [],
  },
  {
    id: 'facturacion_acs',
    nombre: 'Facturación (sistema comercial)',
    unidad: 'usd',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Plata que entró ese día, cuotas incluidas. Solo ventas en USD: mezclar divisas en un total sería una cifra que no significa nada.',
    agrupaciones: [],
  },
  {
    id: 'valor_vendido_acs',
    nombre: 'Valor vendido (sistema comercial)',
    unidad: 'usd',
    agregacion: 'suma',
    mejor: 'alto',
    descripcion:
      'Precio de lo vendido ese día, se cobre cuando se cobre. Distinto de "facturacion_acs" a propósito. Solo ventas en USD.',
    agrupaciones: [],
  },
] as const;

type MetricsSeriesMetric = (typeof METRICS_CATALOG)[number]['id'];
type MetricsSeriesGroupBy = 'origen' | 'campana' | 'producto';
type MetricsSeriesPoint = {
  dia: string;
  origen?: string;
  campana?: string;
  producto?: string;
  valor: number;
};

const METRICS_SERIES_METRICS: readonly MetricsSeriesMetric[] = METRICS_CATALOG.map(
  (entry) => entry.id,
);

// A key of its own. PUBLIC_STATS_API_KEY also opens /origenes and /resumen,
// which group by `correo`, `nombre` or `telefono`: handing it out would give
// away the PII the `Metricas` views exist to keep in.
function requireMetricsApiKey(request: Request) {
  if (!env.METRICS_API_KEY) {
    throw new ApiError('METRICS_API_KEY no configurada.', 503);
  }

  const apiKey = readApiKeyFromRequest(request);
  if (!apiKey) throw new ApiError('Falta la API key.', 401);
  if (apiKey !== env.METRICS_API_KEY) throw new ApiError('API key inválida.', 403);
}

function readMetricsSeriesMetric(url: URL): MetricsSeriesMetric {
  const raw = url.searchParams.get('metrica')?.trim() || 'registros';
  const metric = METRICS_SERIES_METRICS.find((candidate) => candidate === raw);
  if (!metric) {
    throw new ApiError(
      `El parámetro "metrica" no es válido. Valores admitidos: ${METRICS_SERIES_METRICS.join(', ')}. La lista completa está en /api/public/metricas.`,
      400,
    );
  }

  return metric;
}

// Metric-aware on purpose: `agrupaciones` in the catalogue is what the panel
// reads to decide whether to offer the breakdown, so the endpoint has to reject
// exactly what the catalogue does not advertise. Answering an ungrouped series
// to `agrupar=origen` would be worse: the panel would draw one line labelled as
// a breakdown of many.
function readMetricsSeriesGroupBy(
  url: URL,
  metric: MetricsSeriesMetric,
): MetricsSeriesGroupBy | null {
  const raw = url.searchParams.get('agrupar')?.trim();
  if (!raw) return null;

  const entry = METRICS_CATALOG.find((candidate) => candidate.id === metric);
  const allowed: readonly string[] = entry?.agrupaciones ?? [];
  if (!allowed.includes(raw)) {
    throw new ApiError(
      allowed.length === 0
        ? `La métrica "${metric}" no admite "agrupar".`
        : `El parámetro "agrupar" para "${metric}" solo admite: ${allowed.join(', ')}.`,
      400,
    );
  }

  return raw as MetricsSeriesGroupBy;
}

// AAAA-MM-DD and nothing else. A bound carrying a time or a zone would move a
// registro of the 1st to the 31st depending on where it is read.
function readMetricsSeriesDate(url: URL, key: string) {
  const raw = url.searchParams.get(key)?.trim();
  if (!raw) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new ApiError(`El parámetro "${key}" debe tener el formato AAAA-MM-DD.`, 400);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ApiError(`El parámetro "${key}" no es una fecha del calendario.`, 400);
  }

  return raw;
}

function assertMetricsSeriesRange(desde: string | null, hasta: string | null) {
  if (desde && hasta && desde > hasta) {
    throw new ApiError('El parámetro "desde" no puede ser posterior a "hasta".', 400);
  }

  // Only a request that pins `desde` can widen the window: without it the lower
  // bound is derived from the upper one and spans 90 days at most. With it and
  // no `hasta`, the upper bound is `curdate()`, so the cap has to be checked
  // against today or `?desde=2015-01-01` would scan every day on record — and
  // this cap is the endpoint's only real brake (the metrics account's
  // MAX_QUERIES_PER_HOUR does not apply: the query runs as the dashboard user).
  if (!desde) return;

  // Resolved here ONLY to size the window. The query still measures it with
  // MySQL's `curdate()`, so `dia` and its bounds keep sharing one clock; a
  // timezone gap between the two can only shift this check by a day, which a
  // 366-day cap does not care about.
  const upper = hasta ?? new Date().toISOString().slice(0, 10);
  if (desde > upper) return;

  const days =
    (Date.parse(`${upper}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000 + 1;
  if (days > METRICS_SERIES_MAX_DAYS) {
    throw new ApiError(
      `El rango no puede superar ${METRICS_SERIES_MAX_DAYS} días. Pídelo por tramos.`,
      400,
    );
  }
}

// Both bounds are resolved by MySQL, so the window is measured on the same clock
// that computed `dia` inside the views.
function buildMetricsSeriesWindow(dia: AnyColumn, desde: string | null, hasta: string | null) {
  const upper = hasta ? sql`${hasta}` : sql`curdate()`;
  const lower = desde
    ? sql`${desde}`
    : sql`date_sub(${upper}, interval ${sql.raw(String(METRICS_SERIES_DEFAULT_DAYS - 1))} day)`;

  return sql`${dia} between ${lower} and ${upper}`;
}

async function selectMetricsRegistrosSeries(
  projectId: number,
  byOrigin: boolean,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  const view = metricsRegistrosDiarios;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const valor = sql<string>`sum(${view.registros})`;
  const where = and(
    eq(view.proyectoId, projectId),
    buildMetricsSeriesWindow(view.dia, desde, hasta),
  );

  if (byOrigin) {
    const rows = await db
      .select({ dia, origen: view.origen, valor })
      .from(view)
      .where(where)
      .groupBy(view.dia, view.origen)
      .orderBy(view.dia, view.origen);

    return rows.map((row) => ({
      dia: row.dia,
      origen: row.origen ?? METRICS_SERIES_UNKNOWN_ORIGIN,
      valor: Number(row.valor),
    }));
  }

  const rows = await db
    .select({ dia, valor })
    .from(view)
    .where(where)
    .groupBy(view.dia)
    .orderBy(view.dia);

  return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
}

// Grouped by origin the numbers come from `v_encuestas_diarias_por_origen`,
// which reaches the origin through `registros`; a survey whose `contact_id`
// resolves to no registro is therefore absent from the grouped series while the
// ungrouped one still counts it.
async function selectMetricsEncuestasSeries(
  projectId: number,
  metric: 'encuestas' | 'score',
  byOrigin: boolean,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  if (byOrigin) {
    const view = metricsEncuestasDiariasPorOrigen;
    const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
    const where = and(
      eq(view.proyectoId, projectId),
      buildMetricsSeriesWindow(view.dia, desde, hasta),
    );

    if (metric !== 'score') {
      const rows = await db
        .select({ dia, origen: view.origen, valor: sql<string>`sum(${view.encuestas})` })
        .from(view)
        .where(where)
        .groupBy(view.dia, view.origen)
        .orderBy(view.dia, view.origen);

      return rows.map((row) => ({
        dia: row.dia,
        origen: row.origen ?? METRICS_SERIES_UNKNOWN_ORIGIN,
        valor: Number(row.valor),
      }));
    }

    // One row per day and origin already, so the view's average is the answer:
    // averaging averages again would weight a day of 2 answers like one of 200.
    const rows = await db
      .select({ dia, origen: view.origen, valor: view.scoreMedio })
      .from(view)
      .where(and(where, isNotNull(view.scoreMedio)))
      .orderBy(view.dia, view.origen);

    return rows.map((row) => ({
      dia: row.dia,
      origen: row.origen ?? METRICS_SERIES_UNKNOWN_ORIGIN,
      valor: Number(row.valor),
    }));
  }

  const view = metricsEncuestasDiarias;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const where = and(
    eq(view.proyectoId, projectId),
    buildMetricsSeriesWindow(view.dia, desde, hasta),
  );

  if (metric !== 'score') {
    const rows = await db
      .select({ dia, valor: sql<string>`sum(${view.encuestas})` })
      .from(view)
      .where(where)
      .groupBy(view.dia)
      .orderBy(view.dia);

    return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
  }

  const rows = await db
    .select({ dia, valor: view.scoreMedio })
    .from(view)
    .where(and(where, isNotNull(view.scoreMedio)))
    .orderBy(view.dia);

  return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
}

// `v_grupos_por_campana` carries one row per campaign and group, so the daily
// series has to add them up; the campaign split is not exposed here because the
// catalogue does not advertise it.
async function selectMetricsGruposSeries(
  projectId: number,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  const view = metricsGruposPorCampana;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const rows = await db
    .select({ dia, valor: sql<string>`sum(${view.asignaciones})` })
    .from(view)
    .where(and(eq(view.proyectoId, projectId), buildMetricsSeriesWindow(view.dia, desde, hasta)))
    .groupBy(view.dia)
    .orderBy(view.dia);

  return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
}

// Which column of `v_meta_ads_diarias` each Meta metric reads. Declared as
// columns rather than names so a rename cannot leave a catalogue id pointing at
// nothing that TypeScript would notice only in production.
const METRICS_META_COLUMNS = {
  inversion_meta: metricsMetaAdsDiarias.inversion,
  clics_meta: metricsMetaAdsDiarias.clicsEnlace,
  landing_views_meta: metricsMetaAdsDiarias.landingViews,
  registros_meta: metricsMetaAdsDiarias.registrosCompletados,
  leads_meta: metricsMetaAdsDiarias.leads,
} as const;

type MetricsMetaMetric = keyof typeof METRICS_META_COLUMNS;

// Ungrouped, the day's campaigns are added together. `inversion` is DECIMAL, so
// MySQL sums it exactly and only the final Number() moves it to a float — the
// rounding that introduces is far below a cent on any window this endpoint
// serves.
async function selectMetricsMetaSeries(
  projectId: number,
  metric: MetricsMetaMetric,
  byCampaign: boolean,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  const view = metricsMetaAdsDiarias;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const valor = sql<string>`sum(${METRICS_META_COLUMNS[metric]})`;
  const where = and(
    eq(view.proyectoId, projectId),
    buildMetricsSeriesWindow(view.dia, desde, hasta),
  );

  if (byCampaign) {
    const rows = await db
      .select({ dia, campana: view.campana, valor })
      .from(view)
      .where(where)
      .groupBy(view.dia, view.campana)
      .orderBy(view.dia, view.campana);

    return rows.map((row) => ({
      dia: row.dia,
      campana: row.campana,
      valor: Number(row.valor),
    }));
  }

  const rows = await db
    .select({ dia, valor })
    .from(view)
    .where(where)
    .groupBy(view.dia)
    .orderBy(view.dia);

  return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
}

// The only currency the money series adds up. All 3.892 sales in ACS were USD
// when this was measured (2026-09-05) and USD is the agreed unit, but the mirror
// stores the currency it was told: summing a peso row into a dollar total would
// be exactly the kind of number that looks fine and means nothing. A sale in
// another currency is therefore visible in the view and absent from these
// series, which is the honest half of the trade.
const METRICS_ACS_CURRENCY = 'USD';

// Which column each ACS money/count metric reads, as columns rather than names,
// for the same reason as METRICS_META_COLUMNS.
const METRICS_ACS_COLUMNS = {
  ventas_acs: metricsAcsVentasDiarias.ventas,
  cobros_acs: metricsAcsVentasDiarias.cobros,
  facturacion_acs: metricsAcsVentasDiarias.facturacion,
  valor_vendido_acs: metricsAcsVentasDiarias.valorVendido,
} as const;

type MetricsAcsMetric = keyof typeof METRICS_ACS_COLUMNS;

// Counts (`ventas_acs`, `cobros_acs`) add up across currencies: a sale is a sale
// whatever it was priced in. Amounts do not — see METRICS_ACS_CURRENCY.
const METRICS_ACS_MONEY_METRICS: readonly MetricsAcsMetric[] = [
  'facturacion_acs',
  'valor_vendido_acs',
];

async function selectMetricsAcsSeries(
  projectId: number,
  metric: MetricsAcsMetric,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  const view = metricsAcsVentasDiarias;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const valor = sql<string>`sum(${METRICS_ACS_COLUMNS[metric]})`;
  const isMoney = METRICS_ACS_MONEY_METRICS.includes(metric);

  const rows = await db
    .select({ dia, valor })
    .from(view)
    .where(
      and(
        eq(view.proyectoId, projectId),
        buildMetricsSeriesWindow(view.dia, desde, hasta),
        isMoney ? eq(view.moneda, METRICS_ACS_CURRENCY) : undefined,
      ),
    )
    .groupBy(view.dia)
    .orderBy(view.dia);

  return rows.map((row) => ({ dia: row.dia, valor: Number(row.valor) }));
}

// `ventas_acs` grouped by product comes from the second mirror table, which has
// no currency and no amounts. A day whose only activity was an instalment of an
// earlier sale is therefore absent here while `cobros_acs` still reports it —
// measured: four such days in the project 4 backfill.
async function selectMetricsAcsProductoSeries(
  projectId: number,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  const view = metricsAcsVentasProductoDiarias;
  const dia = sql<string>`date_format(${view.dia}, '%Y-%m-%d')`;
  const rows = await db
    .select({ dia, producto: view.productoNombre, valor: sql<string>`sum(${view.ventas})` })
    .from(view)
    .where(and(eq(view.proyectoId, projectId), buildMetricsSeriesWindow(view.dia, desde, hasta)))
    .groupBy(view.dia, view.productoNombre)
    .orderBy(view.dia, view.productoNombre);

  return rows.map((row) => ({ dia: row.dia, producto: row.producto, valor: Number(row.valor) }));
}

// Without `GRANT SELECT ON Metricas.*` to the dashboard's own MySQL user the
// driver raises 1142/1044 and the panel would only see a bare 500.
function translateMetricsSchemaError(err: unknown): never {
  const code = typeof err === 'object' && err !== null ? (err as { code?: unknown }).code : null;

  if (
    code === 'ER_TABLEACCESS_DENIED_ERROR' ||
    code === 'ER_DBACCESS_DENIED_ERROR' ||
    code === 'ER_BAD_DB_ERROR' ||
    code === 'ER_NO_SUCH_TABLE'
  ) {
    throw new ApiError(
      'El esquema Metricas no está disponible para el usuario de la base de datos. Ejecuta scripts/metrics-views.sql y concede SELECT sobre Metricas (docs/runbooks/metrics-db-user.md, apartado 5).',
      503,
    );
  }

  throw err;
}

function selectMetricsSeries(
  projectId: number,
  metric: MetricsSeriesMetric,
  groupBy: MetricsSeriesGroupBy | null,
  desde: string | null,
  hasta: string | null,
): Promise<MetricsSeriesPoint[]> {
  switch (metric) {
    case 'registros':
      return selectMetricsRegistrosSeries(projectId, groupBy === 'origen', desde, hasta);
    case 'grupos':
      return selectMetricsGruposSeries(projectId, desde, hasta);
    case 'inversion_meta':
    case 'clics_meta':
    case 'landing_views_meta':
    case 'registros_meta':
    case 'leads_meta':
      return selectMetricsMetaSeries(projectId, metric, groupBy === 'campana', desde, hasta);
    case 'ventas_acs':
      return groupBy === 'producto'
        ? selectMetricsAcsProductoSeries(projectId, desde, hasta)
        : selectMetricsAcsSeries(projectId, metric, desde, hasta);
    case 'cobros_acs':
    case 'facturacion_acs':
    case 'valor_vendido_acs':
      return selectMetricsAcsSeries(projectId, metric, desde, hasta);
    default:
      return selectMetricsEncuestasSeries(projectId, metric, groupBy === 'origen', desde, hasta);
  }
}

export async function getPublicProjectSeries(request: Request, projectId: number) {
  requireMetricsApiKey(request);

  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const url = new URL(request.url);
  const metric = readMetricsSeriesMetric(url);
  const groupBy = readMetricsSeriesGroupBy(url, metric);
  const desde = readMetricsSeriesDate(url, 'desde');
  const hasta = readMetricsSeriesDate(url, 'hasta');
  assertMetricsSeriesRange(desde, hasta);

  try {
    const serie = await selectMetricsSeries(projectId, metric, groupBy, desde, hasta);

    // The views are recomputed on every query (runbook, "Known limits"); a
    // minute of cache keeps a panel that redraws on each filter change off the
    // base tables.
    return json(serie, 200, { 'cache-control': 'private, max-age=60' });
  } catch (err) {
    translateMetricsSchemaError(err);
  }
}

// The catalogue is static: it describes what the series endpoint can serve, so
// it is generated from the same constant `?metrica=` is validated against and
// can never drift from it.
export async function getPublicMetricsCatalog(request: Request) {
  requireMetricsApiKey(request);
  return json(METRICS_CATALOG, 200, { 'cache-control': 'private, max-age=300' });
}

// Lets the panel discover projects instead of carrying hard-coded ids: a project
// created in the dashboard shows up here on the next request.
//
// `activo` is a derived convenience, not a stored column — `proyecto` has no
// such flag. It is true when the project saw a registro inside the last
// METRICS_PROJECT_ACTIVE_DAYS days, or was created inside that window and has
// not had time to. `ultimoRegistro` is returned alongside so a panel that wants
// a different threshold can apply its own instead of inheriting this one.
export async function getPublicProjectsList(request: Request) {
  requireMetricsApiKey(request);

  try {
    const actividad = db
      .select({
        proyectoId: metricsRegistrosDiarios.proyectoId,
        registros: sql<string>`sum(${metricsRegistrosDiarios.registros})`.as('registros'),
        ultimoDia: sql<string>`max(${metricsRegistrosDiarios.dia})`.as('ultimo_dia'),
      })
      .from(metricsRegistrosDiarios)
      .groupBy(metricsRegistrosDiarios.proyectoId)
      .as('actividad');

    // Same reasoning as the series window: `curdate()` is MySQL's, so `activo`
    // is measured on the clock that computed the days it compares against.
    const activeFrom = sql`date_sub(curdate(), interval ${sql.raw(String(METRICS_PROJECT_ACTIVE_DAYS - 1))} day)`;

    const rows = await db
      .select({
        id: metricsProyectos.proyectoId,
        nombre: metricsProyectos.proyecto,
        fechaAlta: sql<string | null>`date_format(${metricsProyectos.fechaAlta}, '%Y-%m-%d')`,
        ultimoRegistro: sql<string | null>`date_format(${actividad.ultimoDia}, '%Y-%m-%d')`,
        registros: actividad.registros,
        activo: sql<number>`coalesce(${actividad.ultimoDia}, ${metricsProyectos.fechaAlta}) >= ${activeFrom}`,
      })
      .from(metricsProyectos)
      .leftJoin(actividad, eq(actividad.proyectoId, metricsProyectos.proyectoId))
      .orderBy(metricsProyectos.proyecto);

    return json(
      rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        activo: Number(row.activo ?? 0) === 1,
        fechaAlta: row.fechaAlta,
        ultimoRegistro: row.ultimoRegistro,
        registros: Number(row.registros ?? 0),
      })),
      200,
      { 'cache-control': 'private, max-age=60' },
    );
  } catch (err) {
    translateMetricsSchemaError(err);
  }
}

export async function createProject(request: Request) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const nombre = readRequiredString(body, 'nombre');

  const [existing] = await db
    .select({ id: project.id })
    .from(project)
    .where(eq(project.nombre, nombre))
    .limit(1);
  if (existing) throw new ApiError('Ya existe un proyecto con ese nombre.', 409);

  const [createdId] = await db.insert(project).values({ nombre }).$returningId();
  if (!createdId) throw new ApiError('No se pudo crear el proyecto.', 500);
  const proyecto = await findProjectById(createdId.id);
  if (!proyecto) throw new ApiError('No se pudo leer el proyecto creado.', 500);

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'project.created',
    targetType: 'project',
    targetId: String(proyecto.id),
    metadata: { nombre },
  });

  return json({ proyecto }, 201);
}

export async function updateProject(request: Request, projectId: number) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const nombre = readRequiredString(body, 'nombre');

  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  if (nombre !== proyecto.nombre) {
    const [duplicate] = await db
      .select({ id: project.id })
      .from(project)
      .where(eq(project.nombre, nombre))
      .limit(1);
    if (duplicate) throw new ApiError('Ya existe un proyecto con ese nombre.', 409);
  }

  await db.update(project).set({ nombre }).where(eq(project.id, projectId));
  const updated = await findProjectById(projectId);
  if (!updated) throw new ApiError('Proyecto no encontrado.', 404);

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'project.updated',
    targetType: 'project',
    targetId: String(projectId),
    metadata: { nombre },
  });

  return json({ proyecto: updated });
}

export async function deleteProject(request: Request, projectId: number) {
  const { session, headers } = await requireAdmin(request);
  const proyecto = await findProjectById(projectId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  await db.delete(project).where(eq(project.id, projectId));

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'project.deleted',
    targetType: 'project',
    targetId: String(projectId),
    metadata: { nombre: proyecto.nombre },
  });

  return new Response(null, { status: 204 });
}

export async function listRegistros(request: Request) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const proyectoId = readOptionalNumber(url.searchParams.get('proyectoId'), 'proyectoId');

  const query = db.select(REGISTRO_SELECT).from(registro);
  const rows =
    proyectoId === null
      ? await query.orderBy(desc(registro.createdAt), desc(registro.id))
      : await query
          .where(eq(registro.proyectoId, proyectoId))
          .orderBy(desc(registro.createdAt), desc(registro.id));

  return json({ registros: rows });
}

export async function getRegistro(request: Request, registroId: number) {
  await requireAdmin(request);
  const row = await findRegistroById(registroId);
  if (!row) throw new ApiError('Registro no encontrado.', 404);
  return json({ registro: row });
}

export async function createRegistro(request: Request) {
  assertPublicIngestOrigin(request);
  const body = await readJsonObject(request);
  const proyectoId = readProjectIdFromRequest(request, body);
  if (proyectoId === null) throw new ApiError('El campo "proyectoId" es obligatorio.', 400);

  const nombre = readRequiredString(body, 'nombre');
  const correo = readRequiredString(
    { correo: readRegistroBodyValue(body, 'correo') },
    'correo',
  ).toLowerCase();
  const telefono = readOptionalString(body, 'telefono');
  const origen = readRegistroOrigin(body);
  const metadata = readMetadata(body);

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const [createdId] = await db
    .insert(registro)
    .values({
      proyectoId,
      nombre,
      correo,
      telefono,
      origen,
      metadata,
    })
    .$returningId();
  if (!createdId) throw new ApiError('No se pudo crear el registro.', 500);
  const created = await findRegistroById(createdId.id);
  if (!created) throw new ApiError('No se pudo leer el registro creado.', 500);

  await recordAudit({
    actorId: null,
    actorEmail: correo,
    headers: request.headers,
    action: 'registro.created',
    targetType: 'registro',
    targetId: String(created.id),
    metadata: { proyectoId, origen },
  });

  return json({ registro: created }, 200, getCorsHeadersForRequest(request));
}

export async function updateRegistro(request: Request, registroId: number) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const current = await findRegistroById(registroId);
  if (!current) throw new ApiError('Registro no encontrado.', 404);

  const proyectoId =
    readOptionalNumber(readBodyValue(body, 'proyectoId'), 'proyectoId') ?? current.proyectoId;
  const nombre = hasBodyValue(body, 'nombre') ? readRequiredString(body, 'nombre') : current.nombre;
  const correo = hasRegistroBodyValue(body, 'correo')
    ? readRequiredString({ correo: readRegistroBodyValue(body, 'correo') }, 'correo').toLowerCase()
    : current.correo;
  const telefono = hasBodyValue(body, 'telefono')
    ? readOptionalString(body, 'telefono')
    : current.telefono;
  const origen =
    hasBodyValue(body, 'origen') ||
    hasBodyValue(body, 'utm_content') ||
    isPlainObject(body.metadata)
      ? readRegistroOrigin(body, current.origen)
      : current.origen;
  const currentMetadata = isPlainObject(current.metadata) ? current.metadata : {};
  const metadata =
    !hasBodyValue(body, 'metadata') && Object.keys(body).every((key) => isRegistroDirectKey(key))
      ? currentMetadata
      : readMetadata(body);

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  await db
    .update(registro)
    .set({ proyectoId, nombre, correo, telefono, origen, metadata })
    .where(eq(registro.id, registroId));

  const updated = await findRegistroById(registroId);
  if (!updated) throw new ApiError('Registro no encontrado.', 404);

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'registro.updated',
    targetType: 'registro',
    targetId: String(registroId),
    metadata: { proyectoId, origen },
  });

  return json({ registro: updated });
}

export async function deleteRegistro(request: Request, registroId: number) {
  const { session, headers } = await requireAdmin(request);
  const current = await findRegistroById(registroId);
  if (!current) throw new ApiError('Registro no encontrado.', 404);

  await db.delete(registro).where(eq(registro.id, registroId));

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'registro.deleted',
    targetType: 'registro',
    targetId: String(registroId),
    metadata: { proyectoId: current.proyectoId, origen: current.origen },
  });

  return new Response(null, { status: 204 });
}

export async function listEncuestas(request: Request) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const proyectoId = readOptionalNumber(url.searchParams.get('proyectoId'), 'proyectoId');

  const query = db.select(ENCUESTA_SELECT).from(encuesta);
  const rows =
    proyectoId === null
      ? await query.orderBy(desc(encuesta.createdAt), desc(encuesta.id))
      : await query
          .where(eq(encuesta.proyectoId, proyectoId))
          .orderBy(desc(encuesta.createdAt), desc(encuesta.id));

  return json({ encuestas: rows });
}

export async function getEncuesta(request: Request, encuestaId: number) {
  await requireAdmin(request);
  const row = await findEncuestaById(encuestaId);
  if (!row) throw new ApiError('Encuesta no encontrada.', 404);
  return json({ encuesta: row });
}

export async function createEncuesta(request: Request) {
  assertPublicIngestOrigin(request);
  const body = await readJsonObject(request);
  const proyectoId = readProjectIdFromRequest(request, body);
  if (proyectoId === null) throw new ApiError('El campo "proyectoId" es obligatorio.', 400);

  const correo =
    readOptionalAliasString(readEncuestaBodyValue(body, 'email'), 'correo')?.toLowerCase() ?? null;
  const providedContactId =
    readOptionalAliasString(readEncuestaBodyValue(body, 'contactId'), 'contactId') ?? null;
  const score = readOptionalFloat(readEncuestaBodyValue(body, 'score'), 'score');
  const respuestas = readRespuestas(body);
  const actorEmail = correo ?? null;

  if (!correo && !providedContactId) {
    throw new ApiError('Debes enviar "correo" (o "email") o "contactId".', 400);
  }

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const contactId = correo ? await resolveEncuestaContactId(proyectoId, correo) : providedContactId;
  if (!contactId) {
    throw new ApiError('El campo "contactId" es obligatorio.', 400);
  }

  const [createdId] = await db
    .insert(encuesta)
    .values({
      proyectoId,
      contactId,
      respuestas,
      score,
    })
    .$returningId();
  if (!createdId) throw new ApiError('No se pudo crear la encuesta.', 500);
  const created = await findEncuestaById(createdId.id);
  if (!created) throw new ApiError('No se pudo leer la encuesta creada.', 500);

  await recordAudit({
    actorId: null,
    actorEmail,
    headers: request.headers,
    action: 'encuesta.created',
    targetType: 'encuesta',
    targetId: String(created.id),
    metadata: { proyectoId, contactId, score },
  });

  return json({ encuesta: created }, 200, getCorsHeadersForRequest(request));
}

export async function updateEncuesta(request: Request, encuestaId: number) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const current = await findEncuestaById(encuestaId);
  if (!current) throw new ApiError('Encuesta no encontrada.', 404);

  const proyectoId =
    readOptionalNumber(readBodyValue(body, 'proyectoId'), 'proyectoId') ?? current.proyectoId;
  const correo =
    readOptionalAliasString(readEncuestaBodyValue(body, 'email'), 'correo')?.toLowerCase() ?? null;
  const contactId =
    readOptionalAliasString(readEncuestaBodyValue(body, 'contactId'), 'contactId') ??
    current.contactId;
  const score = hasEncuestaBodyValue(body, 'score')
    ? readOptionalFloat(readEncuestaBodyValue(body, 'score'), 'score')
    : current.score;
  const currentRespuestas = isPlainObject(current.respuestas) ? current.respuestas : {};
  const respuestas =
    !hasEncuestaBodyValue(body, 'respuestas') &&
    Object.keys(body).every((key) => isEncuestaDirectKey(key))
      ? currentRespuestas
      : readRespuestas(body);

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const resolvedContactId = correo ? await resolveEncuestaContactId(proyectoId, correo) : contactId;

  await db
    .update(encuesta)
    .set({ proyectoId, contactId: resolvedContactId, respuestas, score })
    .where(eq(encuesta.id, encuestaId));

  const updated = await findEncuestaById(encuestaId);
  if (!updated) throw new ApiError('Encuesta no encontrada.', 404);

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'encuesta.updated',
    targetType: 'encuesta',
    targetId: String(encuestaId),
    metadata: { proyectoId, contactId: resolvedContactId, score },
  });

  return json({ encuesta: updated });
}

export async function deleteEncuesta(request: Request, encuestaId: number) {
  const { session, headers } = await requireAdmin(request);
  const current = await findEncuestaById(encuestaId);
  if (!current) throw new ApiError('Encuesta no encontrada.', 404);

  await db.delete(encuesta).where(eq(encuesta.id, encuestaId));

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'encuesta.deleted',
    targetType: 'encuesta',
    targetId: String(encuestaId),
    metadata: {
      proyectoId: current.proyectoId,
      contactId: current.contactId,
      score: current.score,
    },
  });

  return new Response(null, { status: 204 });
}

export async function listGrupos(request: Request) {
  await requireAdmin(request);
  const url = new URL(request.url);
  const proyectoId = readOptionalNumber(url.searchParams.get('proyectoId'), 'proyectoId');

  const query = db.select(GRUPO_SELECT).from(grupo);
  const rows =
    proyectoId === null
      ? await query.orderBy(desc(grupo.fecha), desc(grupo.id))
      : await query
          .where(eq(grupo.proyectoId, proyectoId))
          .orderBy(desc(grupo.fecha), desc(grupo.id));

  return json({ grupos: rows });
}

export async function getGrupo(request: Request, grupoId: number) {
  await requireAdmin(request);
  const row = await findGrupoById(grupoId);
  if (!row) throw new ApiError('Grupo no encontrado.', 404);
  return json({ grupo: row });
}

export async function createGrupo(request: Request) {
  assertPublicIngestOrigin(request);
  const body = await readJsonObject(request);
  const proyectoId = readProjectIdFromRequest(request, body);
  if (proyectoId === null) throw new ApiError('El campo "proyectoId" es obligatorio.', 400);

  const telefono = readRequiredString(
    { telefono: readGrupoBodyValue(body, 'telefono') },
    'telefono',
  );
  const campana = readRequiredString({ campana: readGrupoBodyValue(body, 'campana') }, 'campana');
  const grupoNombre = readRequiredString({ grupo: readGrupoBodyValue(body, 'grupo') }, 'grupo');
  const fecha = readRequiredDate({ fecha: readGrupoBodyValue(body, 'fecha') }, 'fecha');

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  const [createdId] = await db
    .insert(grupo)
    .values({
      proyectoId,
      telefono,
      campana,
      grupo: grupoNombre,
      fecha,
    })
    .$returningId();
  if (!createdId) throw new ApiError('No se pudo crear el grupo.', 500);
  const created = await findGrupoById(createdId.id);
  if (!created) throw new ApiError('No se pudo leer el grupo creado.', 500);

  await recordAudit({
    actorId: null,
    actorEmail: null,
    headers: request.headers,
    action: 'grupo.created',
    targetType: 'grupo',
    targetId: String(created.id),
    metadata: { proyectoId, telefono, campana, grupo: grupoNombre },
  });

  return json({ grupo: created }, 200, getCorsHeadersForRequest(request));
}

export async function updateGrupo(request: Request, grupoId: number) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const current = await findGrupoById(grupoId);
  if (!current) throw new ApiError('Grupo no encontrado.', 404);

  const proyectoId =
    readOptionalNumber(readBodyValue(body, 'proyectoId'), 'proyectoId') ?? current.proyectoId;
  const telefono = hasGrupoBodyValue(body, 'telefono')
    ? readRequiredString({ telefono: readGrupoBodyValue(body, 'telefono') }, 'telefono')
    : current.telefono;
  const campana = hasGrupoBodyValue(body, 'campana')
    ? readRequiredString({ campana: readGrupoBodyValue(body, 'campana') }, 'campana')
    : current.campana;
  const grupoNombre = hasGrupoBodyValue(body, 'grupo')
    ? readRequiredString({ grupo: readGrupoBodyValue(body, 'grupo') }, 'grupo')
    : current.grupo;
  const fecha = hasGrupoBodyValue(body, 'fecha')
    ? readRequiredDate({ fecha: readGrupoBodyValue(body, 'fecha') }, 'fecha')
    : current.fecha;

  const proyecto = await findProjectById(proyectoId);
  if (!proyecto) throw new ApiError('Proyecto no encontrado.', 404);

  await db
    .update(grupo)
    .set({ proyectoId, telefono, campana, grupo: grupoNombre, fecha })
    .where(eq(grupo.id, grupoId));

  const updated = await findGrupoById(grupoId);
  if (!updated) throw new ApiError('Grupo no encontrado.', 404);

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'grupo.updated',
    targetType: 'grupo',
    targetId: String(grupoId),
    metadata: { proyectoId, telefono, campana, grupo: grupoNombre },
  });

  return json({ grupo: updated });
}

export async function deleteGrupo(request: Request, grupoId: number) {
  const { session, headers } = await requireAdmin(request);
  const current = await findGrupoById(grupoId);
  if (!current) throw new ApiError('Grupo no encontrado.', 404);

  await db.delete(grupo).where(eq(grupo.id, grupoId));

  await recordAudit({
    actorId: session.user.id,
    actorEmail: session.user.email,
    headers,
    action: 'grupo.deleted',
    targetType: 'grupo',
    targetId: String(grupoId),
    metadata: {
      proyectoId: current.proyectoId,
      telefono: current.telefono,
      campana: current.campana,
      grupo: current.grupo,
    },
  });

  return new Response(null, { status: 204 });
}

export function parseNumericRouteParam(value: string | undefined, key: string) {
  const parsed = readOptionalNumber(value, key);
  if (parsed === null) throw new ApiError(`El parámetro "${key}" es obligatorio.`, 400);
  return parsed;
}

export async function handleApiError(
  action: string,
  context: Record<string, unknown>,
  err: unknown,
  request?: Request,
) {
  const corsHeaders = request ? getCorsHeadersForRequest(request) : undefined;
  if (err instanceof ApiError) {
    await logError({
      level: 'error',
      message: `${action}: ${err.message}`,
      stack: err.stack ?? null,
      source: action,
      metadata: {
        ...context,
        error: {
          type: 'ApiError',
          status: err.status,
          message: err.message,
        },
      },
    });
    return json({ error: err.message }, err.status, corsHeaders);
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;
  console.error(`[api] ${action} failed`, context, err);
  await logError({
    level: 'error',
    message: `${action}: ${message}`,
    stack,
    source: action,
    metadata: {
      ...context,
      error: {
        type: err instanceof Error ? err.name : typeof err,
        message,
      },
    },
  });

  return json({ error: 'Algo falló al procesar la solicitud.' }, 500, corsHeaders);
}

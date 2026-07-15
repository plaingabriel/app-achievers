import { db } from '@/db/index';
import { encuesta, grupo, project, registro } from '@/db/schema/index';
import { recordAudit } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { logError } from '@/lib/error-log';
import { resolveAccess } from '@/lib/rbac';
import { and, desc, eq } from 'drizzle-orm';

type JsonObject = Record<string, unknown>;
type ApiLogContext = Record<string, unknown>;
type HeaderMap = Record<string, string>;

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
    throw new ApiError(`El campo "${key}" debe ser una fecha vÃ¡lida.`, 400);
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
  const origen = readOptionalString(body, 'origen') || 'Sin origen';
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
  const origen = hasBodyValue(body, 'origen') ? readRequiredString(body, 'origen') : current.origen;
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

  const correo = hasEncuestaBodyValue(body, 'email')
    ? readRequiredString({ correo: readEncuestaBodyValue(body, 'email') }, 'correo').toLowerCase()
    : null;
  const providedContactId = hasEncuestaBodyValue(body, 'contactId')
    ? readRequiredString({ contactId: readEncuestaBodyValue(body, 'contactId') }, 'contactId')
    : null;
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
  const correo = hasEncuestaBodyValue(body, 'email')
    ? readRequiredString({ correo: readEncuestaBodyValue(body, 'email') }, 'correo').toLowerCase()
    : null;
  const contactId = hasEncuestaBodyValue(body, 'contactId')
    ? readRequiredString({ contactId: readEncuestaBodyValue(body, 'contactId') }, 'contactId')
    : current.contactId;
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

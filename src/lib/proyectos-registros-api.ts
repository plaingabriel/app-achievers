import { db } from '@/db/index';
import { project, registro } from '@/db/schema/index';
import { recordAudit } from '@/lib/audit';
import { auth } from '@/lib/auth';
import { logError } from '@/lib/error-log';
import { resolveAccess } from '@/lib/rbac';
import { desc, eq } from 'drizzle-orm';

type JsonObject = Record<string, unknown>;

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

const REGISTRO_DIRECT_KEYS = new Set([
  'proyectoId',
  'nombre',
  'correo',
  'telefono',
  'origen',
  'metadata',
]);

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request) {
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

function readRequiredString(body: JsonObject, key: string) {
  const value = body[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ApiError(`El campo "${key}" es obligatorio.`, 400);
  }
  return value.trim();
}

function readOptionalString(body: JsonObject, key: string) {
  const value = body[key];
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

function readMetadata(body: JsonObject) {
  const metadata: JsonObject = {};
  const explicit = body.metadata;

  if (explicit !== undefined) {
    if (!isPlainObject(explicit)) {
      throw new ApiError('El campo "metadata" debe ser un objeto JSON.', 400);
    }
    Object.assign(metadata, explicit);
  }

  for (const [key, value] of Object.entries(body)) {
    if (!REGISTRO_DIRECT_KEYS.has(key)) {
      metadata[key] = value;
    }
  }

  return metadata;
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
  const body = await readJsonObject(request);
  const proyectoId = readOptionalNumber(body.proyectoId, 'proyectoId');
  if (proyectoId === null) throw new ApiError('El campo "proyectoId" es obligatorio.', 400);

  const nombre = readRequiredString(body, 'nombre');
  const correo = readRequiredString(body, 'correo').toLowerCase();
  const telefono = readOptionalString(body, 'telefono');
  const origen = readRequiredString(body, 'origen');
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

  return json({ registro: created }, 201);
}

export async function updateRegistro(request: Request, registroId: number) {
  const { session, headers } = await requireAdmin(request);
  const body = await readJsonObject(request);
  const current = await findRegistroById(registroId);
  if (!current) throw new ApiError('Registro no encontrado.', 404);

  const proyectoId = readOptionalNumber(body.proyectoId, 'proyectoId') ?? current.proyectoId;
  const nombre = body.nombre === undefined ? current.nombre : readRequiredString(body, 'nombre');
  const correo =
    body.correo === undefined ? current.correo : readRequiredString(body, 'correo').toLowerCase();
  const telefono =
    body.telefono === undefined ? current.telefono : readOptionalString(body, 'telefono');
  const origen = body.origen === undefined ? current.origen : readRequiredString(body, 'origen');
  const currentMetadata = isPlainObject(current.metadata) ? current.metadata : {};
  const metadata =
    body.metadata === undefined && Object.keys(body).every((key) => REGISTRO_DIRECT_KEYS.has(key))
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

export function parseNumericRouteParam(value: string | undefined, key: string) {
  const parsed = readOptionalNumber(value, key);
  if (parsed === null) throw new ApiError(`El parámetro "${key}" es obligatorio.`, 400);
  return parsed;
}

export async function handleApiError(
  action: string,
  context: Record<string, unknown>,
  err: unknown,
) {
  if (err instanceof ApiError) {
    return json({ error: err.message }, err.status);
  }

  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? (err.stack ?? null) : null;
  console.error(`[api] ${action} failed`, context, err);
  await logError({
    level: 'error',
    message: `${action}: ${message}`,
    stack,
    source: action,
    metadata: context,
  });

  return json({ error: 'Algo falló al procesar la solicitud.' }, 500);
}

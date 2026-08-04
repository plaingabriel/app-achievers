import { db } from '@/db/index';
import { encuesta, grupo, project, registro, userProjectAccess } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { and, count, desc, eq, inArray, max } from 'drizzle-orm';
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
  createdAt: string;
};

export type ProjectSummary = ProjectItem & {
  registrosCount: number;
  encuestasCount: number;
  gruposCount: number;
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

export type ProjectDetail = {
  project: ProjectItem;
  registros: RegistroItem[];
  encuestas: EncuestaItem[];
  grupos: GrupoItem[];
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
      createdAt: project.createdAt,
    })
    .from(project)
    .where(eq(project.id, id))
    .limit(1);

  return row
    ? {
        ...row,
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
  fecha: Date;
  createdAt: Date;
}): GrupoItem {
  return {
    id: row.id,
    proyectoId: row.proyectoId,
    telefono: row.telefono,
    campana: row.campana,
    grupo: row.grupo,
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
      db
        .select({
          projectId: grupo.proyectoId,
          total: count(grupo.id),
          latestAt: max(grupo.fecha),
        })
        .from(grupo)
        .where(access.isAdmin ? undefined : inArray(grupo.proyectoId, projectIds))
        .groupBy(grupo.proyectoId),
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
          createdAt: item.createdAt.toISOString(),
          registrosCount: registrosStats ? Number(registrosStats.total) : 0,
          encuestasCount: encuestasStats ? Number(encuestasStats.total) : 0,
          gruposCount: gruposStats ? Number(gruposStats.total) : 0,
          latestRegistroAt: registrosStats?.latestAt ? registrosStats.latestAt.toISOString() : null,
          latestEncuestaAt: encuestasStats?.latestAt ? encuestasStats.latestAt.toISOString() : null,
          latestGrupoAt: gruposStats?.latestAt ? gruposStats.latestAt.toISOString() : null,
        };
      }),
    };
  },
);

export const fetchProjectDetail = createServerFn({ method: 'GET' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }): Promise<ProjectDetail> => {
    await assertProjectPermission('projects:read', data.projectId);

    const selectedProject = await findProjectById(data.projectId);
    if (!selectedProject) throw new Error(es.projects.notFound);

    const [registros, encuestas, grupos] = await Promise.all([
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
        .where(eq(registro.proyectoId, data.projectId))
        .orderBy(desc(registro.createdAt), desc(registro.id)),
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
        .where(eq(encuesta.proyectoId, data.projectId))
        .orderBy(desc(encuesta.createdAt), desc(encuesta.id)),
      db
        .select({
          id: grupo.id,
          proyectoId: grupo.proyectoId,
          telefono: grupo.telefono,
          campana: grupo.campana,
          grupo: grupo.grupo,
          fecha: grupo.fecha,
          createdAt: grupo.createdAt,
        })
        .from(grupo)
        .where(eq(grupo.proyectoId, data.projectId))
        .orderBy(desc(grupo.fecha), desc(grupo.id)),
    ]);

    return {
      project: selectedProject,
      registros: registros.map((item) => toRegistroItem(item)),
      encuestas: encuestas.map((item) => toEncuestaItem(item)),
      grupos: grupos.map((item) => toGrupoItem(item)),
    };
  });

export const createProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: {
      nombre: string;
      metaMetricsUrl?: string;
      metaMetricsSheetId?: string;
      metaMetricsSheetIndex?: number | string;
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

      if (!nombre) return { ok: false, error: es.projects.nameRequired };
      const rawMetaMetricsSheetId = data.metaMetricsSheetId?.trim() ?? '';
      const hasAnyMetaConfig =
        rawMetaMetricsUrl.length > 0 ||
        rawMetaMetricsSheetId.length > 0 ||
        data.metaMetricsSheetIndex !== undefined;
      const hasFullMetaConfig =
        metaMetricsUrl !== null &&
        metaMetricsSheetId !== null &&
        metaMetricsSheetIndex !== null;
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
        .values({ nombre, metaMetricsUrl, metaMetricsSheetId, metaMetricsSheetIndex })
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
        metadata: { nombre, metaMetricsUrl, metaMetricsSheetId, metaMetricsSheetIndex },
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

      if (!nombre) return { ok: false, error: es.projects.nameRequired };
      const rawMetaMetricsSheetId = data.metaMetricsSheetId?.trim() ?? '';
      const hasAnyMetaConfig =
        rawMetaMetricsUrl.length > 0 ||
        rawMetaMetricsSheetId.length > 0 ||
        data.metaMetricsSheetIndex !== undefined;
      const hasFullMetaConfig =
        metaMetricsUrl !== null &&
        metaMetricsSheetId !== null &&
        metaMetricsSheetIndex !== null;
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
        .set({ nombre, metaMetricsUrl, metaMetricsSheetId, metaMetricsSheetIndex })
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
        metadata: { nombre, metaMetricsUrl, metaMetricsSheetId, metaMetricsSheetIndex },
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

import { db } from '@/db/index';
import { grupo, project, registro } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { count, desc, eq, max } from 'drizzle-orm';
import { assertAdmin, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type ProjectItem = {
  id: number;
  nombre: string;
  createdAt: string;
};

export type ProjectSummary = ProjectItem & {
  registrosCount: number;
  gruposCount: number;
  latestRegistroAt: string | null;
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

export type ProjectsOverview = {
  projects: ProjectSummary[];
};

export type ProjectDetail = {
  project: ProjectItem;
  registros: RegistroItem[];
  grupos: GrupoItem[];
};

type ProjectMutationResult = { ok: true; project: ProjectItem } | { ok: false; error: string };

type DeleteProjectResult = MutationResult & { deletedId?: number };

function normalizeNombre(nombre: string) {
  return nombre.trim();
}

async function findProjectById(id: number) {
  const [row] = await db
    .select({
      id: project.id,
      nombre: project.nombre,
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

export const fetchProjectsOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<ProjectsOverview> => {
    await assertAdmin();

    const [projects, registrosGrouped, gruposGrouped] = await Promise.all([
      db
        .select({
          id: project.id,
          nombre: project.nombre,
          createdAt: project.createdAt,
        })
        .from(project)
        .orderBy(project.nombre),
      db
        .select({
          projectId: registro.proyectoId,
          total: count(registro.id),
          latestAt: max(registro.createdAt),
        })
        .from(registro)
        .groupBy(registro.proyectoId),
      db
        .select({
          projectId: grupo.proyectoId,
          total: count(grupo.id),
          latestAt: max(grupo.fecha),
        })
        .from(grupo)
        .groupBy(grupo.proyectoId),
    ]);

    const registrosMap = new Map(registrosGrouped.map((row) => [row.projectId, row]));
    const gruposMap = new Map(gruposGrouped.map((row) => [row.projectId, row]));

    return {
      projects: projects.map((item) => {
        const registrosStats = registrosMap.get(item.id);
        const gruposStats = gruposMap.get(item.id);
        return {
          id: item.id,
          nombre: item.nombre,
          createdAt: item.createdAt.toISOString(),
          registrosCount: registrosStats ? Number(registrosStats.total) : 0,
          gruposCount: gruposStats ? Number(gruposStats.total) : 0,
          latestRegistroAt: registrosStats?.latestAt ? registrosStats.latestAt.toISOString() : null,
          latestGrupoAt: gruposStats?.latestAt ? gruposStats.latestAt.toISOString() : null,
        };
      }),
    };
  },
);

export const fetchProjectDetail = createServerFn({ method: 'POST' })
  .inputValidator((data: { projectId: number }) => data)
  .handler(async ({ data }): Promise<ProjectDetail> => {
    await assertAdmin();

    const selectedProject = await findProjectById(data.projectId);
    if (!selectedProject) throw new Error(es.projects.notFound);

    const [registros, grupos] = await Promise.all([
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
      grupos: grupos.map((item) => toGrupoItem(item)),
    };
  });

export const createProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator((data: { nombre: string }) => data)
  .handler(async ({ data }): Promise<ProjectMutationResult> => {
    try {
      const { session, headers } = await assertAdmin();
      const nombre = normalizeNombre(data.nombre);

      if (!nombre) return { ok: false, error: es.projects.nameRequired };

      const [existing] = await db
        .select({ id: project.id })
        .from(project)
        .where(eq(project.nombre, nombre))
        .limit(1);
      if (existing) return { ok: false, error: es.projects.duplicateName };

      const [createdId] = await db.insert(project).values({ nombre }).$returningId();
      if (!createdId) return { ok: false, error: es.errors.generic };

      const created = await findProjectById(createdId.id);
      if (!created) return { ok: false, error: es.errors.generic };

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.created',
        targetType: 'project',
        targetId: String(created.id),
        metadata: { nombre },
      });

      return { ok: true, project: created };
    } catch (err) {
      logServerError('createProjectEntry', { nombre: data.nombre }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const updateProjectEntry = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: number; nombre: string }) => data)
  .handler(async ({ data }): Promise<ProjectMutationResult> => {
    try {
      const { session, headers } = await assertAdmin();
      const nombre = normalizeNombre(data.nombre);

      if (!nombre) return { ok: false, error: es.projects.nameRequired };

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

      await db.update(project).set({ nombre }).where(eq(project.id, data.id));
      const updated = await findProjectById(data.id);
      if (!updated) return { ok: false, error: es.projects.notFound };

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'project.updated',
        targetType: 'project',
        targetId: String(data.id),
        metadata: { nombre },
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
      const { session, headers } = await assertAdmin();

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

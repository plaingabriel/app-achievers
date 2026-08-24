import { db } from '@/db/index';
import { encuesta, project, registro } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm';
import { auth } from './auth';
import { type EncuestaScoreMode, buildEncuestasConditions } from './projects-dashboard-server';
import { canAccessProject, resolveAccess } from './rbac';
import { logServerError } from './server-rbac';

// Streaming CSV export for a project's surveys.
//
// The old path was a server function that returned every matching survey AND
// every contact of the project as one JSON payload. On the large projects (70k+
// surveys, each carrying a `respuestas` blob) that materialises hundreds of MB
// in the Node process, which trips PM2's `max_memory_restart` before the
// response is ever written. Here the rows are read in batches and pushed
// straight into the response stream, so peak memory is one batch regardless of
// how many rows match.

const ROW_BATCH_SIZE = 500;
const METADATA_SCAN_BATCH_SIZE = 2000;
const SCORE_MODES: EncuestaScoreMode[] = ['all', 'gt', 'lt', 'between'];

type ContactRow = {
  id: number;
  nombre: string;
  correo: string;
  telefono: string | null;
  origen: string;
  metadata: unknown;
  createdAt: Date;
};

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

// Same gate as assertProjectPermission, but answering with an HTTP status the
// browser can act on instead of throwing through the server-function channel.
async function authorize(request: Request, projectId: number) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return jsonError(401, 'No autenticado.');

  const access = await resolveAccess(session.user.id);
  if (!access.isAdmin && !access.permissions.has('projects:read')) {
    return jsonError(403, es.errors.unauthorized);
  }
  if (!canAccessProject(access, projectId)) return jsonError(403, es.errors.unauthorized);

  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function escapeCsvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvLine(values: string[]) {
  return `${values.map(escapeCsvCell).join(',')}\r\n`;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map((item) => formatValue(item)).join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// The CSV used to be built in the browser, so timestamps read in the viewer's
// timezone. The client sends its IANA zone so the file keeps saying the same
// thing now that the formatting happens on the server.
function createDateFormatter(timeZone: string) {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  };

  try {
    return new Intl.DateTimeFormat('es-ES', { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat('es-ES', options);
  }
}

function readScoreMode(value: string | null): EncuestaScoreMode {
  const mode = value as EncuestaScoreMode | null;
  return mode && SCORE_MODES.includes(mode) ? mode : 'all';
}

function buildFileName(projectName: string) {
  const safeName =
    `encuestas-${projectName}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-_]/g, '') || 'encuestas';
  return `${safeName}.csv`;
}

// Contact metadata is free-form, so the column set is whatever keys the project
// uses. Scanned in batches: only the key names are kept, never the rows.
async function collectContactMetadataKeys(projectId: number) {
  const keys = new Set<string>();
  let cursor = 0;

  while (true) {
    const rows = await db
      .select({ id: registro.id, metadata: registro.metadata })
      .from(registro)
      .where(and(eq(registro.proyectoId, projectId), gt(registro.id, cursor)))
      .orderBy(asc(registro.id))
      .limit(METADATA_SCAN_BATCH_SIZE);

    const lastRow = rows.at(-1);
    if (!lastRow) break;
    cursor = lastRow.id;

    for (const row of rows) {
      if (!isPlainObject(row.metadata)) continue;
      for (const key of Object.keys(row.metadata)) keys.add(key);
    }

    if (rows.length < METADATA_SCAN_BATCH_SIZE) break;
  }

  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}

async function loadContactsForBatch(projectId: number, contactIds: number[]) {
  if (contactIds.length === 0) return new Map<number, ContactRow>();

  const rows = await db
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
    .where(and(eq(registro.proyectoId, projectId), inArray(registro.id, contactIds)));

  return new Map(rows.map((row) => [row.id, row] as const));
}

export async function exportEncuestasCsv(request: Request, projectId: number): Promise<Response> {
  const denial = await authorize(request, projectId);
  if (denial) return denial;

  const url = new URL(request.url);
  const filters = {
    projectId,
    query: url.searchParams.get('query') ?? '',
    dateFrom: url.searchParams.get('dateFrom') ?? '',
    dateTo: url.searchParams.get('dateTo') ?? '',
    scoreMode: readScoreMode(url.searchParams.get('scoreMode')),
    scoreMin: url.searchParams.get('scoreMin') ?? '',
    scoreMax: url.searchParams.get('scoreMax') ?? '',
  };
  const surveyKeys = url.searchParams.getAll('key');
  const formatDateTime = createDateFormatter(url.searchParams.get('tz') ?? 'UTC');

  const [projectRow] = await db
    .select({ nombre: project.nombre })
    .from(project)
    .where(eq(project.id, projectId))
    .limit(1);
  if (!projectRow) return jsonError(404, 'El proyecto no existe.');

  const metadataKeys = await collectContactMetadataKeys(projectId);
  const header = [
    es.projects.createdCol,
    es.projects.surveyContactCol,
    es.projects.surveyScoreCol,
    'Contacto creado',
    'Contacto nombre',
    'Contacto correo',
    'Contacto telefono',
    'Contacto origen',
    ...metadataKeys.map((key) => `Contacto ${key}`),
    ...surveyKeys,
  ];

  const conditions = buildEncuestasConditions(filters);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Keyset pagination on the primary key. OFFSET would re-scan every page
      // and, on an append-only table, can skip or repeat rows mid-export.
      let cursor: number | null = null;

      try {
        controller.enqueue(encoder.encode(`﻿${csvLine(header)}`));

        while (true) {
          const batch = await db
            .select({
              id: encuesta.id,
              contactId: encuesta.contactId,
              respuestas: encuesta.respuestas,
              score: encuesta.score,
              createdAt: encuesta.createdAt,
            })
            .from(encuesta)
            .where(and(...conditions, ...(cursor === null ? [] : [lt(encuesta.id, cursor)])))
            .orderBy(desc(encuesta.id))
            .limit(ROW_BATCH_SIZE);

          const lastRow = batch.at(-1);
          if (!lastRow) break;
          cursor = lastRow.id;

          const contactIds = Array.from(
            new Set(batch.map((row) => Number(row.contactId)).filter(Number.isFinite)),
          );
          const contactos = await loadContactsForBatch(projectId, contactIds);

          for (const row of batch) {
            const contacto = contactos.get(Number(row.contactId));
            const respuestas = isPlainObject(row.respuestas) ? row.respuestas : null;

            controller.enqueue(
              encoder.encode(
                csvLine([
                  formatDateTime.format(row.createdAt),
                  row.contactId,
                  row.score === null ? '' : String(row.score),
                  contacto ? formatDateTime.format(contacto.createdAt) : '',
                  contacto?.nombre ?? '',
                  contacto?.correo ?? '',
                  contacto?.telefono ?? '',
                  contacto?.origen ?? '',
                  ...metadataKeys.map((key) =>
                    contacto && isPlainObject(contacto.metadata)
                      ? formatValue(contacto.metadata[key])
                      : '',
                  ),
                  ...surveyKeys.map((key) => formatValue(respuestas?.[key])),
                ]),
              ),
            );
          }

          if (batch.length < ROW_BATCH_SIZE) break;
        }

        controller.close();
      } catch (err) {
        logServerError('exportEncuestasCsv', { projectId }, err);
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${buildFileName(projectRow.nombre)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

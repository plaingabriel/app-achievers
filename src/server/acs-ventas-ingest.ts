import { db } from '@/db/index';
import { acsVentaDiaria, acsVentaProductoDiaria, project } from '@/db/schema/index';
import { env } from '@/lib/env';
import { logError } from '@/lib/error-log';
import { and, between, eq, isNotNull, ne } from 'drizzle-orm';

// Daily mirror of `achievers-comercial-system` sales into `Evergreen`.
//
// WHY THIS RUNS HERE AND NOT IN `server-achievers`. That repo has no access to
// ACS's Supabase — zero references to it — so the dashboard is the only process
// that reaches both sides. The Express server keeps writing `meta_ads_diarias`
// and `sells`; this table is ours.
//
// WHY MIRROR AT ALL. `/api/public/proyectos/:id/series` answers only from the
// `Metricas` views. Calling ACS from inside it would put a third party in the
// path of an endpoint that today can only fail on its own database — see
// docs/runbooks/metrics-db-user.md §6.

// How many trailing days to re-read on every pass. Sales are not final when the
// day closes: measured on 2026-09-05, `lanzamiento` reported 2919 sales and 2923
// a few minutes later, and a refund removes a sale that was already counted.
// Reading only yesterday would freeze the first version of every day.
const INGEST_WINDOW_DAYS = 7;

// The day boundary ACS cuts on. Passed explicitly rather than relying on the
// endpoint's default, so a change to that default cannot silently move a sale
// from one day to another here.
const ACS_ZONE = 'America/Montevideo';

// The canonical VIP sale is a single payment, but a product sold in instalments
// produces many rows per sale; the endpoint already separates the two and this
// mirror keeps them in separate columns. Never derive one from the other.
const INSERT_CHUNK_SIZE = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type DayCurrency = {
  moneda?: unknown;
  cantidad_ventas?: unknown;
  cantidad_cobros?: unknown;
  facturacion?: unknown;
  valor_vendido?: unknown;
};

type DayProduct = {
  producto_id?: unknown;
  producto_nombre?: unknown;
  cantidad_ventas?: unknown;
};

type MetricsDay = {
  fecha?: unknown;
  facturacion_por_moneda?: unknown;
  ventas_por_producto?: unknown;
};

type MetricsPayload = {
  success?: unknown;
  data?: { metricas?: { ventas_por_dia?: unknown } };
  meta?: {
    filters?: { edicionId?: unknown };
    lectura?: { completo?: unknown; filas?: unknown };
  };
};

type ProjectConfig = {
  id: number;
  nombre: string;
  salesProjectCode: string;
  salesEditionId: string | null;
};

function toCount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

// The endpoint sums money in JS `Number` and hands back values like
// 1131241.1200000013. The columns are DECIMAL, so the string is what gets
// stored — rounding here rather than letting the driver decide.
function toAmount(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

// Today as ACS cuts it, not as the server's clock sees it. Between 21:00 and
// midnight in Montevideo these differ, which is exactly when a launch closes.
function businessToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ACS_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDays(isoDate: string, days: number) {
  // Defaults keep `noUncheckedIndexedAccess` happy; the only caller feeds this
  // the output of `businessToday()`, which is always a well-formed ISO date.
  const [year = 0, month = 1, day = 1] = isoDate.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

function chunk<T>(rows: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

async function fetchProjectDays(config: ProjectConfig, dateStart: string, dateEnd: string) {
  const url = new URL(env.SALES_METRICS_URL);
  // Still called `projectCode`, but since ACS-63 it resolves against
  // `modalidades`. See docs/ventas-vip.md.
  url.searchParams.set('projectCode', config.salesProjectCode);
  url.searchParams.set('dateStart', dateStart);
  url.searchParams.set('dateEnd', dateEnd);
  url.searchParams.set('groupBy', 'dia');
  // `dias` alone: it already carries both `facturacion_por_moneda` and
  // `ventas_por_producto` per day. Asking for `cobranza` would scan every
  // pending instalment in that system and answers a question about today, not
  // about the window.
  url.searchParams.set('incluir', 'dias');
  url.searchParams.set('zona', ACS_ZONE);
  if (config.salesEditionId) url.searchParams.set('edicionId', config.salesEditionId);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json', 'x-api-key': env.SALES_METRICS_API_KEY },
  });

  if (!response.ok) {
    throw new Error(
      `ACS answered HTTP ${response.status} for projectCode=${config.salesProjectCode}`,
    );
  }

  const payload = (await response.json()) as MetricsPayload;
  if (payload.success !== true) {
    throw new Error(`ACS answered success=false for projectCode=${config.salesProjectCode}`);
  }

  // A partial read must never be written. PostgREST caps at 1000 rows and ACS
  // pages around it; `completo: false` means it hit its own page ceiling and the
  // totals are built from less data than exists. Storing that would publish a
  // number that looks sane and is not.
  if (payload.meta?.lectura?.completo === false) {
    throw new Error(
      `ACS read was incomplete for projectCode=${config.salesProjectCode} (${toCount(payload.meta?.lectura?.filas)} rows); nothing written`,
    );
  }

  // If an edition was requested, the answer has to say it honoured it. An
  // endpoint that ignored the parameter would return the whole modalidad —
  // measured at 41% above the edition on `lanzamiento` — and we would store it
  // labelled as that edition.
  if (config.salesEditionId && payload.meta?.filters?.edicionId !== config.salesEditionId) {
    throw new Error(
      `ACS did not apply edicionId=${config.salesEditionId} for projectCode=${config.salesProjectCode}; nothing written`,
    );
  }

  const days = payload.data?.metricas?.ventas_por_dia;
  return Array.isArray(days) ? (days as MetricsDay[]) : [];
}

function buildRows(config: ProjectConfig, days: MetricsDay[]) {
  const edicion = config.salesEditionId ?? '';
  const currencyRows: (typeof acsVentaDiaria.$inferInsert)[] = [];
  const productRows: (typeof acsVentaProductoDiaria.$inferInsert)[] = [];

  for (const day of days) {
    const dia = typeof day.fecha === 'string' && ISO_DATE.test(day.fecha) ? day.fecha : null;
    if (!dia) continue;

    const currencies = Array.isArray(day.facturacion_por_moneda)
      ? (day.facturacion_por_moneda as DayCurrency[])
      : [];

    for (const entry of currencies) {
      const moneda = typeof entry.moneda === 'string' ? entry.moneda.trim().slice(0, 3) : '';
      if (!moneda) continue;
      currencyRows.push({
        proyectoId: config.id,
        dia,
        modalidad: config.salesProjectCode,
        edicion,
        moneda,
        ventas: toCount(entry.cantidad_ventas),
        cobros: toCount(entry.cantidad_cobros),
        valorVendido: toAmount(entry.valor_vendido),
        facturacion: toAmount(entry.facturacion),
      });
    }

    const products = Array.isArray(day.ventas_por_producto)
      ? (day.ventas_por_producto as DayProduct[])
      : [];

    for (const entry of products) {
      const productoId = typeof entry.producto_id === 'string' ? entry.producto_id : '';
      if (!productoId) continue;
      productRows.push({
        proyectoId: config.id,
        dia,
        modalidad: config.salesProjectCode,
        edicion,
        productoId,
        // Denormalised: no view can resolve a name against ACS, and the
        // catalogue there was consolidated from 31 products to 7.
        productoNombre:
          typeof entry.producto_nombre === 'string' ? entry.producto_nombre.slice(0, 255) : '',
        ventas: toCount(entry.cantidad_ventas),
      });
    }
  }

  return { currencyRows, productRows };
}

async function ingestProject(config: ProjectConfig, dateStart: string, dateEnd: string) {
  const days = await fetchProjectDays(config, dateStart, dateEnd);
  const { currencyRows, productRows } = buildRows(config, days);

  // ACS CAN ANSWER A DAY OUTSIDE THE WINDOW, AND THE DELETE HAS TO COVER IT.
  //
  // The endpoint filters by timestamp (`fecha_pago.gte.<dateStart>T00:00:00`,
  // effectively UTC) but buckets the day in America/Montevideo, three hours
  // behind. A payment at 01:00Z on `dateStart` passes the filter and lands in
  // the PREVIOUS day's bucket. Measured on the first run: a window starting
  // 2026-08-29 came back with a 2026-08-28 row.
  //
  // Deleting only [dateStart, dateEnd] would leave that row behind, and the very
  // next pass would try to insert it again and die on the unique key, rolling
  // back the whole project every time. So the replaced range is the union of the
  // window asked for and the days actually answered. ISO dates compare
  // lexicographically, which is why plain string min/max is enough.
  const reportedDays = [
    ...currencyRows.map((row) => row.dia),
    ...productRows.map((row) => row.dia),
  ];
  const deleteStart = reportedDays.reduce((min, dia) => (dia < min ? dia : min), dateStart);
  const deleteEnd = reportedDays.reduce((max, dia) => (dia > max ? dia : max), dateEnd);

  // DELETE + INSERT over that range, not a plain upsert. A refund or a soft
  // delete in ACS makes a day stop being reported; an upsert-only pass would
  // leave that day's old row in place for ever. The range is small and the whole
  // replacement runs in one transaction, so no reader sees a gap.
  await db.transaction(async (tx) => {
    await tx
      .delete(acsVentaDiaria)
      .where(
        and(
          eq(acsVentaDiaria.proyectoId, config.id),
          between(acsVentaDiaria.dia, deleteStart, deleteEnd),
        ),
      );
    await tx
      .delete(acsVentaProductoDiaria)
      .where(
        and(
          eq(acsVentaProductoDiaria.proyectoId, config.id),
          between(acsVentaProductoDiaria.dia, deleteStart, deleteEnd),
        ),
      );

    for (const batch of chunk(currencyRows, INSERT_CHUNK_SIZE)) {
      await tx.insert(acsVentaDiaria).values(batch);
    }
    for (const batch of chunk(productRows, INSERT_CHUNK_SIZE)) {
      await tx.insert(acsVentaProductoDiaria).values(batch);
    }
  });

  return { dias: days.length, monedas: currencyRows.length, productos: productRows.length };
}

/**
 * Reads the trailing window from ACS and replaces it in `acs_ventas_diarias`
 * and `acs_ventas_producto_diarias`. Safe to run repeatedly: every pass rewrites
 * the same window.
 *
 * `days` widens the window for a manual backfill; the scheduled pass uses the
 * default. One project failing never stops the others — each is logged and the
 * loop continues.
 */
export async function runAcsVentasIngest(options: { days?: number } = {}) {
  if (!env.SALES_METRICS_API_KEY) {
    console.info('[acs-ventas] SALES_METRICS_API_KEY not set, skipping');
    return;
  }

  const windowDays = options.days ?? INGEST_WINDOW_DAYS;
  const dateEnd = businessToday();
  const dateStart = shiftDays(dateEnd, -windowDays);

  const projects = (await db
    .select({
      id: project.id,
      nombre: project.nombre,
      salesProjectCode: project.salesProjectCode,
      salesEditionId: project.salesEditionId,
    })
    .from(project)
    .where(
      and(isNotNull(project.salesProjectCode), ne(project.salesProjectCode, '')),
    )) as ProjectConfig[];

  if (projects.length === 0) {
    console.info('[acs-ventas] no project declares a sales modalidad, nothing to mirror');
    return;
  }

  for (const config of projects) {
    try {
      const result = await ingestProject(config, dateStart, dateEnd);
      console.info(
        '[acs-ventas] project %d (%s): %d days, %d currency rows, %d product rows',
        config.id,
        config.salesProjectCode,
        result.dias,
        result.monedas,
        result.productos,
      );
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[acs-ventas] project %d failed: %s', config.id, error.message);
      await logError({
        level: 'error',
        message: `acsVentasIngest: ${error.message}`,
        stack: error.stack ?? null,
        source: 'acs-ventas-ingest',
        metadata: {
          proyectoId: config.id,
          modalidad: config.salesProjectCode,
          edicionId: config.salesEditionId,
          dateStart,
          dateEnd,
        },
      });
    }
  }
}

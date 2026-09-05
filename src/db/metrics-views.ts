// Read-only handles for the `Metricas` schema — the aggregate, PII-free views
// that `scripts/metrics-views.sql` creates on the droplet (see
// docs/runbooks/metrics-db-user.md).
//
// Deliberately NOT re-exported from `./schema/index` and NOT listed in
// drizzle.config.ts: nothing here is dashboard-owned, and drizzle-kit must
// never generate a migration that creates or drops one of these. `.existing()`
// says the same thing to Drizzle at runtime. The one writer is that SQL script,
// run by hand.
//
// Only the columns the dashboard reads are declared; the views carry more.
import { bigint, date, double, mysqlSchema, varchar } from 'drizzle-orm/mysql-core';

export const METRICS_SCHEMA_NAME = 'Metricas';

const metricas = mysqlSchema(METRICS_SCHEMA_NAME);

// Project catalogue. `v_proyectos` deliberately omits the internal config
// columns (`meta_metrics_url`, sheet ids, sales codes), so listing projects over
// HTTPS cannot leak them.
export const metricsProyectos = metricas
  .view('v_proyectos', {
    proyectoId: bigint('proyecto_id', { mode: 'number' }).notNull(),
    proyecto: varchar('proyecto', { length: 255 }).notNull(),
    fechaAlta: date('fecha_alta', { mode: 'string' }),
  })
  .existing();

export const metricsRegistrosDiarios = metricas
  .view('v_registros_diarios', {
    proyectoId: bigint('proyecto_id', { mode: 'number' }).notNull(),
    origen: varchar('origen', { length: 128 }),
    dia: date('dia', { mode: 'string' }).notNull(),
    registros: bigint('registros', { mode: 'number' }).notNull(),
  })
  .existing();

export const metricsEncuestasDiarias = metricas
  .view('v_encuestas_diarias', {
    proyectoId: bigint('proyecto_id', { mode: 'number' }).notNull(),
    dia: date('dia', { mode: 'string' }).notNull(),
    encuestas: bigint('encuestas', { mode: 'number' }).notNull(),
    encuestasConScore: bigint('encuestas_con_score', { mode: 'number' }).notNull(),
    scoreMedio: double('score_medio'),
  })
  .existing();

export const metricsEncuestasDiariasPorOrigen = metricas
  .view('v_encuestas_diarias_por_origen', {
    proyectoId: bigint('proyecto_id', { mode: 'number' }).notNull(),
    origen: varchar('origen', { length: 128 }),
    dia: date('dia', { mode: 'string' }).notNull(),
    encuestas: bigint('encuestas', { mode: 'number' }).notNull(),
    encuestasConScore: bigint('encuestas_con_score', { mode: 'number' }).notNull(),
    scoreMedio: double('score_medio'),
  })
  .existing();

// `dia` here is `DATE(g.fecha)` — the date the assignment is *for*, not the row's
// `created_at`. A group loaded in advance therefore lands on its own day, which
// is what the panel wants to plot and what makes this series non-comparable with
// the `registros` one day by day.
export const metricsGruposPorCampana = metricas
  .view('v_grupos_por_campana', {
    proyectoId: bigint('proyecto_id', { mode: 'number' }).notNull(),
    campana: varchar('campana', { length: 255 }),
    grupo: varchar('grupo', { length: 255 }),
    dia: date('dia', { mode: 'string' }).notNull(),
    asignaciones: bigint('asignaciones', { mode: 'number' }).notNull(),
  })
  .existing();

-- Metricas — aggregate, read-only views for the metrics DB user (see
-- docs/runbooks/metrics-db-user.md).
--
-- This is NOT a Drizzle migration. It creates a separate `Metricas` schema and
-- never touches `Evergreen`: it only reads. Nothing is altered or removed, least
-- of all the frozen tables (`Calendarios`, `Closers`, `Personas`). Run it by hand
-- from an account that holds SELECT on `Evergreen` (the DEFINER defaults to that
-- account, and SQL SECURITY DEFINER is what lets the metrics user read the views
-- without any privilege on the base tables):
--
--   sudo mysql --defaults-file=/etc/mysql/debian.cnf < scripts/metrics-views.sql
--
-- `sudo mysql` alone fails with ERROR 1045 on this droplet: root@localhost
-- authenticates by password, not by socket. See the runbook, section 1.
--
-- Every view is aggregated and PII-free by design: no nombre, correo or
-- telefono of any lead leaves this file. `Personas` is deliberately absent —
-- it is nothing but personal data (id + name) and has no aggregate value.
-- Re-run this file after editing; each view is replaced in place.

CREATE DATABASE IF NOT EXISTS `Metricas` CHARACTER SET utf8mb4;

-- Project catalogue. Internal config columns (metrics URLs, sheet ids, sales
-- codes) are intentionally omitted.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_proyectos` AS
SELECT
  p.id                    AS proyecto_id,
  p.nombre                AS proyecto,
  DATE(p.created_at)      AS fecha_alta
FROM `Evergreen`.`proyecto` p;

-- Registrations per project / origin / day.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_registros_diarios` AS
SELECT
  r.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  r.origen                AS origen,
  DATE(r.created_at)      AS dia,
  COUNT(*)                AS registros
FROM `Evergreen`.`registros` r
JOIN `Evergreen`.`proyecto` p ON p.id = r.proyecto_id
GROUP BY r.proyecto_id, p.nombre, r.origen, DATE(r.created_at);

-- Registration totals per project / origin, with the active window.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_registros_por_origen` AS
SELECT
  r.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  r.origen                AS origen,
  COUNT(*)                AS registros,
  COUNT(DISTINCT r.correo) AS correos_unicos,
  MIN(r.created_at)       AS primer_registro,
  MAX(r.created_at)       AS ultimo_registro
FROM `Evergreen`.`registros` r
JOIN `Evergreen`.`proyecto` p ON p.id = r.proyecto_id
GROUP BY r.proyecto_id, p.nombre, r.origen;

-- Survey volume and average score per project / day.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_encuestas_diarias` AS
SELECT
  e.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  DATE(e.created_at)      AS dia,
  COUNT(*)                AS encuestas,
  ROUND(AVG(e.score), 2)  AS score_medio
FROM `Evergreen`.`encuestas` e
JOIN `Evergreen`.`proyecto` p ON p.id = e.proyecto_id
GROUP BY e.proyecto_id, p.nombre, DATE(e.created_at);

-- Survey volume and average score per project / origin / day. Same shape as
-- `v_encuestas_diarias`, split by the origin of the lead that answered: the
-- HTTPS series endpoint has to answer `agrupar=origen` for `encuestas` and
-- `score`, and neither `v_encuestas_diarias` (no origin) nor
-- `v_scores_por_origen` (no day) can. Same cast-join as `v_scores_por_origen`,
-- so a survey whose `contact_id` matches no registro is absent here while
-- `v_encuestas_diarias` still counts it: grouped totals can come out lower than
-- ungrouped ones for the same day.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_encuestas_diarias_por_origen` AS
SELECT
  e.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  r.origen                AS origen,
  DATE(e.created_at)      AS dia,
  COUNT(*)                AS encuestas,
  ROUND(AVG(e.score), 2)  AS score_medio
FROM `Evergreen`.`encuestas` e
JOIN `Evergreen`.`registros` r ON r.id = CAST(e.contact_id AS UNSIGNED)
JOIN `Evergreen`.`proyecto` p ON p.id = e.proyecto_id
GROUP BY e.proyecto_id, p.nombre, r.origen, DATE(e.created_at);

-- Average score per project / origin. `encuestas.contact_id` holds the
-- `registros.id` as a string, which is why the join casts.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_scores_por_origen` AS
SELECT
  e.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  r.origen                AS origen,
  COUNT(e.score)          AS respuestas,
  ROUND(AVG(e.score), 2)  AS score_medio,
  MIN(e.score)            AS score_min,
  MAX(e.score)            AS score_max
FROM `Evergreen`.`encuestas` e
JOIN `Evergreen`.`registros` r ON r.id = CAST(e.contact_id AS UNSIGNED)
JOIN `Evergreen`.`proyecto` p ON p.id = e.proyecto_id
WHERE e.score IS NOT NULL
GROUP BY e.proyecto_id, p.nombre, r.origen;

-- Group assignments per campaign / day. `telefono` is aggregated away.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_grupos_por_campana` AS
SELECT
  g.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  g.campana               AS campana,
  g.grupo                 AS grupo,
  DATE(g.fecha)           AS dia,
  COUNT(*)                AS asignaciones,
  COUNT(DISTINCT g.telefono) AS telefonos_unicos
FROM `Evergreen`.`grupos` g
JOIN `Evergreen`.`proyecto` p ON p.id = g.proyecto_id
GROUP BY g.proyecto_id, p.nombre, g.campana, g.grupo, DATE(g.fecha);

-- Daily Meta Ads figures per project / campaign / day. The base rows are written
-- by the ingest job in `server-achievers` (see docs/db/meta_ads_diarias.md) and
-- are already one per project, day and campaign, so this view only projects
-- them: there is nothing left to aggregate. No PII — campaign-level ad figures
-- carry no lead data at all.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_meta_ads_diarias` AS
SELECT
  m.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  m.campana               AS campana,
  m.dia                   AS dia,
  m.inversion             AS inversion,
  m.clics_enlace          AS clics_enlace,
  m.landing_views         AS landing_views,
  m.registros_completados AS registros_completados,
  m.leads                 AS leads
FROM `Evergreen`.`meta_ads_diarias` m
JOIN `Evergreen`.`proyecto` p ON p.id = m.proyecto_id;

-- Closers roster (staff, not leads). Email PK and Notion ids are omitted.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_closers` AS
SELECT
  CONCAT_WS(' ', c.nombre, c.apellido) AS closer,
  c.funnel                AS funnel,
  c.activo                AS activo
FROM `Evergreen`.`Closers` c;

-- Calendar configuration counts per funnel.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_calendarios` AS
SELECT
  c.funnel                AS funnel,
  c.setter                AS setter,
  c.activo                AS activo,
  COUNT(*)                AS calendarios
FROM `Evergreen`.`Calendarios` c
GROUP BY c.funnel, c.setter, c.activo;

-- Daily sales mirrored from `achievers-comercial-system`. The base rows are
-- written by the dashboard's own cron (`src/server/acs-ventas-ingest.ts`), which
-- is the only process that reaches both ACS and this database — see
-- docs/db/acs_ventas_diarias.md. Like `v_meta_ads_diarias` these views only
-- project: the ingest already stores one row per grain.
--
-- No PII by construction. ACS knows the buyer's name and email; this mirror
-- stores counts and amounts per day and never asked for a person.
--
-- TWO VIEWS BECAUSE THERE ARE TWO GRAINS, and the source cannot answer one.
-- Per day, `public-project-metrics` reports money per CURRENCY and counts per
-- PRODUCT; its daily product breakdown carries no amounts at all. A single view
-- would have to invent per-product revenue.
--
-- `edicion` is '' when the project declares no `sales_edition_id`, which means
-- the numbers are the WHOLE modalidad and not one launch. Measured on project 4
-- before it was set: 1.718.560,55 USD against the 56.133,00 that were actually
-- its edition's. Anything reading these views should treat '' as "unscoped",
-- not as a missing label.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_acs_ventas_diarias` AS
SELECT
  a.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  a.modalidad             AS modalidad,
  a.edicion               AS edicion,
  a.moneda                AS moneda,
  a.dia                   AS dia,
  a.ventas                AS ventas,
  a.cobros                AS cobros,
  a.valor_vendido         AS valor_vendido,
  a.facturacion           AS facturacion
FROM `Evergreen`.`acs_ventas_diarias` a
JOIN `Evergreen`.`proyecto` p ON p.id = a.proyecto_id;

-- Sales per project, day and ACS product. Counts only, for the reason above.
-- `producto_nombre` is stored alongside the id because no view can resolve a
-- name against ACS, and that catalogue was consolidated from 31 products to 7.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_acs_ventas_producto_diarias` AS
SELECT
  a.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  a.modalidad             AS modalidad,
  a.edicion               AS edicion,
  a.producto_id           AS producto_id,
  a.producto_nombre       AS producto_nombre,
  a.dia                   AS dia,
  a.ventas                AS ventas
FROM `Evergreen`.`acs_ventas_producto_diarias` a
JOIN `Evergreen`.`proyecto` p ON p.id = a.proyecto_id;

-- Registrations per project / country / day. The country is DERIVED from the
-- E.164 prefix of `registros.telefono`: no column, no form field and no UTM in
-- `Evergreen` carries a country, and the phone is the only thing every registro
-- has (0 rows with an empty `telefono` on 2026-09-08, 159.707 of 159.725 stored
-- with a leading `+`).
--
-- Measured against the one independent country signal in the database — the
-- `__submission.country` the survey platform derives from the submitter's IP and
-- stores inside `encuestas.respuestas` — the two agree on 98,4 % of the leads
-- that have both. The disagreements are the expected ones: an Argentine line
-- answering from Brazil or Spain. The phone is the lead's own declared number,
-- so it is the one kept; the IP signal is not available for a registro that
-- never answered the survey (20 % of them) and could not fill this view anyway.
--
-- A number stored without `+` cannot be placed and lands in 'Sin país' rather
-- than being guessed into Argentina (18 rows). A prefix outside the list lands
-- in 'Otro país'. Both are values, not nulls: the panel has to be able to show
-- how much of a day it could not place.
--
-- Prefix order matters and is longest-first per family. The `+5xx` families do
-- not overlap (Latin America is `+51`…`+58` at two digits and `+50x`/`+59x` at
-- three), and `+1` is tested last because it is the only single-digit code.
-- `+1` is North America as a block: the NANP shares it between the United
-- States, Canada and the Caribbean, and only an area-code table could split it.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_registros_diarios_por_pais` AS
SELECT
  r.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  CASE
    WHEN r.telefono NOT LIKE '+%'   THEN 'Sin país'
    WHEN r.telefono LIKE '+502%'    THEN 'Guatemala'
    WHEN r.telefono LIKE '+503%'    THEN 'El Salvador'
    WHEN r.telefono LIKE '+504%'    THEN 'Honduras'
    WHEN r.telefono LIKE '+505%'    THEN 'Nicaragua'
    WHEN r.telefono LIKE '+506%'    THEN 'Costa Rica'
    WHEN r.telefono LIKE '+507%'    THEN 'Panamá'
    WHEN r.telefono LIKE '+509%'    THEN 'Haití'
    WHEN r.telefono LIKE '+591%'    THEN 'Bolivia'
    WHEN r.telefono LIKE '+592%'    THEN 'Guyana'
    WHEN r.telefono LIKE '+593%'    THEN 'Ecuador'
    WHEN r.telefono LIKE '+594%'    THEN 'Guayana Francesa'
    WHEN r.telefono LIKE '+595%'    THEN 'Paraguay'
    WHEN r.telefono LIKE '+597%'    THEN 'Surinam'
    WHEN r.telefono LIKE '+598%'    THEN 'Uruguay'
    WHEN r.telefono LIKE '+599%'    THEN 'Caribe neerlandés'
    WHEN r.telefono LIKE '+51%'     THEN 'Perú'
    WHEN r.telefono LIKE '+52%'     THEN 'México'
    WHEN r.telefono LIKE '+53%'     THEN 'Cuba'
    WHEN r.telefono LIKE '+54%'     THEN 'Argentina'
    WHEN r.telefono LIKE '+55%'     THEN 'Brasil'
    WHEN r.telefono LIKE '+56%'     THEN 'Chile'
    WHEN r.telefono LIKE '+57%'     THEN 'Colombia'
    WHEN r.telefono LIKE '+58%'     THEN 'Venezuela'
    WHEN r.telefono LIKE '+351%'    THEN 'Portugal'
    WHEN r.telefono LIKE '+352%'    THEN 'Luxemburgo'
    WHEN r.telefono LIKE '+353%'    THEN 'Irlanda'
    WHEN r.telefono LIKE '+31%'     THEN 'Países Bajos'
    WHEN r.telefono LIKE '+32%'     THEN 'Bélgica'
    WHEN r.telefono LIKE '+33%'     THEN 'Francia'
    WHEN r.telefono LIKE '+34%'     THEN 'España'
    WHEN r.telefono LIKE '+39%'     THEN 'Italia'
    WHEN r.telefono LIKE '+41%'     THEN 'Suiza'
    WHEN r.telefono LIKE '+43%'     THEN 'Austria'
    WHEN r.telefono LIKE '+44%'     THEN 'Reino Unido'
    WHEN r.telefono LIKE '+45%'     THEN 'Dinamarca'
    WHEN r.telefono LIKE '+46%'     THEN 'Suecia'
    WHEN r.telefono LIKE '+47%'     THEN 'Noruega'
    WHEN r.telefono LIKE '+48%'     THEN 'Polonia'
    WHEN r.telefono LIKE '+49%'     THEN 'Alemania'
    WHEN r.telefono LIKE '+212%'    THEN 'Marruecos'
    WHEN r.telefono LIKE '+971%'    THEN 'Emiratos Árabes Unidos'
    WHEN r.telefono LIKE '+972%'    THEN 'Israel'
    WHEN r.telefono LIKE '+61%'     THEN 'Australia'
    WHEN r.telefono LIKE '+64%'     THEN 'Nueva Zelanda'
    WHEN r.telefono LIKE '+7%'      THEN 'Rusia y Kazajistán'
    WHEN r.telefono LIKE '+81%'     THEN 'Japón'
    WHEN r.telefono LIKE '+82%'     THEN 'Corea del Sur'
    WHEN r.telefono LIKE '+86%'     THEN 'China'
    WHEN r.telefono LIKE '+91%'     THEN 'India'
    WHEN r.telefono LIKE '+1%'      THEN 'Estados Unidos y Canadá'
    ELSE 'Otro país'
  END                     AS pais,
  DATE(r.created_at)      AS dia,
  COUNT(*)                AS registros
FROM `Evergreen`.`registros` r
JOIN `Evergreen`.`proyecto` p ON p.id = r.proyecto_id
GROUP BY r.proyecto_id, p.nombre, pais, DATE(r.created_at);

-- Lead funnel per project / stage / day — the series behind `leads_etapa`.
--
-- READ THIS BEFORE ADDING A STAGE. The panel's stage vocabulary is fixed and has
-- six values, in this order: `registro`, `captacion_inicio`, `nombre`,
-- `clic_grupo`, `confirmado_grupo`, `info_clase`. **This database observes two of
-- them.** The other four are steps *inside* the WhatsApp API (ManyChat) — the
-- contact entering the flow, giving name and email again, tapping the group
-- link, and receiving the class details — and no row of `Evergreen` records any
-- of them: `server-achievers` calls ManyChat and never writes a stage back (the
-- only two writers it has into this schema are `sells` and `meta_ads_diarias`).
-- That is why the Black Friday debrief was typed by hand.
--
-- A stage nobody measures is therefore ABSENT from this view, never `0`. Zero is
-- a measurement; absence is "no source". Filling the four missing rows means
-- adding a ManyChat ingest that writes them per project and day, and then adding
-- them here — the endpoint and the panel need no change for that.
--
-- The two stages served are counted on the day each event belongs to, which is
-- not the same clock for both: `registro` uses `DATE(created_at)` like
-- `v_registros_diarios`, `confirmado_grupo` uses `DATE(g.fecha)` — the date the
-- SendFlow assignment is *for* — like `v_grupos_por_campana`. Comparing the two
-- day by day inherits that gap; comparing them over a launch does not.
--
-- `confirmado_grupo` counts group ENTRIES (`evento = 'entrada'`), so a lead added
-- to two groups counts twice and a lead who left is still counted, exactly like
-- the `grupos` metric. It is entries, not current membership — see
-- docs/db/ingesta-publica.md.
CREATE OR REPLACE
  SQL SECURITY DEFINER
  VIEW `Metricas`.`v_leads_etapa_diarias` AS
SELECT
  r.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  'registro'              AS etapa,
  DATE(r.created_at)      AS dia,
  COUNT(*)                AS leads
FROM `Evergreen`.`registros` r
JOIN `Evergreen`.`proyecto` p ON p.id = r.proyecto_id
GROUP BY r.proyecto_id, p.nombre, DATE(r.created_at)
UNION ALL
SELECT
  g.proyecto_id           AS proyecto_id,
  p.nombre                AS proyecto,
  'confirmado_grupo'      AS etapa,
  DATE(g.fecha)           AS dia,
  COUNT(*)                AS leads
FROM `Evergreen`.`grupos` g
JOIN `Evergreen`.`proyecto` p ON p.id = g.proyecto_id
WHERE g.evento = 'entrada'
GROUP BY g.proyecto_id, p.nombre, DATE(g.fecha);

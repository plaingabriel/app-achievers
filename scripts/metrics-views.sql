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
--   sudo mysql < scripts/metrics-views.sql
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
  COUNT(e.score)          AS encuestas_con_score,
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
  COUNT(e.score)          AS encuestas_con_score,
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

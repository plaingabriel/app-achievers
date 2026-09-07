# Ventas VIP — contrato dashboard ↔ `achievers-comercial-system`

Indicador de ventas de accesos VIP en el dash de un proyecto
(`/proyectos` → pestaña **dash**): número de ventas y porcentaje sobre los leads
que entraron a grupos, más una cuarta serie en la gráfica diaria.

## De dónde salen los datos

Las ventas viven en **`achievers-comercial-system`** (la plataforma de ventas,
https://market.achievers.es), sobre Supabase. No están en `Evergreen` ni las
gestiona `server-achievers`.

> Histórico: la primera versión leía Notion (Ventas Achievers) a través de
> `server-achievers`. Quedó obsoleta cuando las ventas se movieron al sistema
> comercial — **pero solo a partir de Septiembre 2026**. El VIP de Mayo 2026
> sigue estando únicamente en Notion: ver la tabla de abajo antes de dar por
> hecho que ACS tiene un lanzamiento.

## Dónde está el VIP de cada lanzamiento (medido 2026-09-07)

No hay una única fuente. Consultados el mismo día ACS (endpoint público, rango
2024-01-01 → 2026-12-31) y la base de Notion **VENTAS ACHIEVERS ACADEMY**
(filtro `Producto Adquirido contains "Entrada VIP - Desafio Importador"`, sin
filtro de fecha):

| Lanzamiento | En ACS | En Notion |
|---|---|---|
| Abril 2025 | 0 | 0 |
| Octubre 2025 | 0 | 0 |
| **Mayo 2026** | **1 VIP** (+ 844 Importador PRO) | **2.120 VIP** |
| Septiembre 2026 | 2.275 VIP | 0 |

Tres lecturas, y ninguna es la que se venía asumiendo:

1. **El VIP de Mayo 2026 está en Notion, no en ACS.** ACS tiene de esa edición el
   curso (844 Importador PRO) y **una** entrada VIP suelta. Las 2.120 restantes
   nunca se migraron. El dash de ese lanzamiento necesita las dos fuentes a la
   vez, y hay que contar con que esa venta única puede estar en ambas.
2. **De 2025 no hay nada en ninguna parte.** Las ediciones Abril 2025 y Octubre
   2025 existen en ACS y están vacías, y Notion tampoco tiene una sola página del
   producto anterior a 2026-04-01. Para esos dos lanzamientos el VIP solo puede
   ser una cifra declarada a mano, si es que Woker tiene de dónde sacarla.
3. **Septiembre 2026 es el único caso limpio**: todo en ACS, nada en Notion.

### Qué hay exactamente en Notion

2.120 páginas, **2026-04-01 → 2026-06-26**, repartidas en 42 días distintos. Pico
el 2026-05-05 con 458 (el cierre del lanzamiento); la cola de junio es una sola
venta el 26. Es decir: **grano diario real**, no un total.

- **Las 2.120 son `Status = "Pago Completo"`.** El lector viejo no filtraba por
  `Status` — contaba `Seña`, `Cuotas` y `--` por igual — y eso sigue siendo cierto
  del código, pero para este producto no cambia nada: no hay una sola venta VIP en
  otro estado. Un conteo de Notion y uno de ACS son comparables aquí.
- **2.120 con `Email` (100 %) y 2.118 con `Telefono` (99 %)**, así que la regla de
  atribución vieja (cruce por correo con `registros` o por teléfono con `grupos`)
  es viable sobre estos datos.
- El nombre del producto **no coincide entre sistemas**: Notion lo llama
  `Entrada VIP - Desafio Importador` (guion normal, sin tilde) y ACS
  `Entrada VIP — Desafío Importador` (raya, con tilde). Los dos filtros son
  literales; no son intercambiables.

### 🔴 Esas ventas no pueden guardarse en `acs_ventas_diarias`

Es la tentación obvia — misma forma, misma métrica — y rompería. El ingest de ACS
hace **DELETE + INSERT de la ventana entera** que lee, dentro de una transacción
(`docs/db/acs_ventas_diarias.md`, regla 2). Una fila de origen Notion en abril o
mayo de 2026 sobreviviría hasta el primer `acs-ventas-ingest.ts 400`, que barre
ese rango y la borra sin avisar. Si esas 2.120 se mirroran, va a ser en su propia
tabla.

### El código para leerlas se recupera del historial

```bash
git -C ../server-achievers show ef5b7dc^:src/modules/ventas/services/ventas-por-producto.service.ts
```

`ef5b7dc` ("remove unused rate limit handling and ventas API key guard") borró el
servicio, su schema, el guard de API key y `libraries/notion/rate-limit-retry.ts`.
`queryAllFromDatabase` y `notionProperties` siguen en el repo, así que revivirlo
cuesta ese archivo más el reintento. El endpoint era
`GET {SERVER_URL}/ventas/por-producto?producto=&dateStart=&dateEnd=`, con caché de
10 minutos por producto y rango, y devolvía una fila por venta con `fechaKey`
(`Fecha de Compra` recortada a `YYYY-MM-DD`).

El filtro, que es lo único imprescindible:

```jsonc
{ "and": [
  { "property": "Producto Adquirido", "multi_select": { "contains": producto } },
  { "property": "Fecha de Compra", "date": { "on_or_after": dateStart } },
  { "property": "Fecha de Compra", "date": { "on_or_before": dateEnd } }
]}
```

Las credenciales son las del servidor (`NOTION_TOKEN_VENTAS_ACHIEVERS`,
`NOTION_DB_ID_VENTAS_ACHIEVERS`), no las del dashboard.

## 🔴 El sistema comercial desarmó el proyecto (ACS-3 → ACS-63)

Lo que allá se llamaba **proyecto** ("Lanz. Desafío Importador - Mayo 2026")
mezclaba cuatro cosas y se desarmó en dos:

- **modalidad** — cómo se vende: `lanzamiento`, `evergreen`, `renovacion`,
  `achievers_live`, `evento_presencial`, `workshop_online`, `ascension`.
- **edición** — qué tanda de esa modalidad ("Mayo 2026").

La tabla `proyectos` **ya no existe** (migración `se_va_el_proyecto`), así que
**ningún código `PRY-00000` resuelve**: el endpoint contesta 404. Además el
catálogo se consolidó (ACS-5, `consolidar_catalogo`): las copias del mismo
producto se fusionaron en uno canónico y las ventas se reasignaron, con lo que
los `vip_product_id` viejos tampoco cuentan nada. El VIP canónico hoy es
`fb8eab8b-f587-4fd7-83be-bc2c16779a61` ("Entrada VIP — Desafío Importador").

**Qué guardar en cada proyecto del dashboard:** en
`proyecto.sales_project_code`, el **código de la modalidad**
(`lanzamiento`, `MOD-00100`, …); en `proyecto.vip_product_id`, el UUID del
producto VIP canónico; y opcionalmente en `proyecto.sales_edition_id`
(migración `drizzle/0010_project_sales_edition.sql`), el UUID de la **edición**.
`sales_project_code` conserva el nombre viejo a propósito: renombrar la tabla
`proyecto` de `Evergreen` no aporta nada y cuesta una migración.

## El endpoint

`GET {SALES_METRICS_URL}` → Edge Function `public-project-metrics`
(por defecto `https://bgbbckfqdplingyhnmbn.supabase.co/functions/v1/public-project-metrics`).

Autenticación: cabecera `x-api-key` con `PUBLIC_PROJECT_METRICS_API_KEY`
(secret de Supabase). En el dashboard es `SALES_METRICS_API_KEY`.

| Query param | Obligatorio | Formato |
|---|---|---|
| `projectCode` | sí (o `projectId`) | `modalidades.codigo`, p. ej. `lanzamiento` |
| `projectId` | — | UUID de la modalidad |
| `edicionId` | no | UUID de `ediciones`. **Implementado y desplegado** (verificado 2026-09-05) |
| `dateStart` | no | `YYYY-MM-DD` |
| `dateEnd` | no | `YYYY-MM-DD` |
| `groupBy` | no | `dia` — añade `metricas.ventas_por_dia` |
| `zona` | no | zona horaria del corte del día (por omisión `America/Montevideo`) |
| `incluir` | no | qué métricas traer: `resumen,facturacion,productos,dias,cobranza` |
| `catalogo` | no | `1` devuelve solo el catálogo de métricas disponibles |

Los nombres `projectCode`/`projectId` no cambiaron, pero **resuelven contra
`modalidades`**. El dashboard envía `projectCode`, el rango del dash,
`groupBy=dia` e `incluir=productos,dias` (sin `incluir`, el endpoint además
calcula `cobranza`, que recorre todas las cuotas pendientes del sistema y esta
tarjeta no muestra).

`catalogo=1` es la lista de métricas que el endpoint sabe responder, pensada para
que el dashboard pueda ofrecerlas sin tenerlas escritas a mano. Hoy no se usa.

Respuesta relevante:

```json
{
  "success": true,
  "data": {
    "modalidad": { "id": "uuid", "codigo": "lanzamiento", "nombre": "Lanzamiento", "activa": true },
    "metricas": {
      "cantidad_ventas": 996,
      "cantidad_cobros": 1000,
      "ventas_por_producto": [
        { "producto_id": "uuid", "producto_nombre": "Entrada VIP — Desafío Importador",
          "cantidad_ventas": 995, "facturacion_por_moneda": [ … ] }
      ],
      "ventas_por_dia": [
        { "fecha": "2026-08-11", "cantidad_ventas": 4,
          "facturacion_por_moneda": [ … ],
          "ventas_por_producto": [ { "producto_id": "uuid", "producto_nombre": "…", "cantidad_ventas": 4 } ] }
      ]
    }
  }
}
```

`data.proyecto` pasó a llamarse **`data.modalidad`** (y `estado` → `activa`); el
dashboard lee la nueva y cae a la vieja por si contesta una versión sin
desplegar. Cada entrada de `facturacion_por_moneda` trae ahora cuatro cifras:
`cantidad_ventas`, `cantidad_cobros`, `valor_vendido` y `facturacion`. La
documentación del endpoint está en `ENDPOINTS_PUBLICOS.txt` del repo del sistema
comercial — **desactualizada**: sigue describiendo proyectos y corte UTC. Manda
el código de la función.

## Cómo configurar un proyecto

En el dashboard: **Proyectos** → seleccionar el proyecto → **Editar proyecto** →
bloque **Ventas VIP**. Tres campos, los dos primeros obligatorios.

**Codigo de modalidad comercial.** Son siete y son fijos (`modalidades.codigo`,
migración `20260825120000_modalidades_ediciones.sql`):

| Código | Modalidad | Por ediciones |
|---|---|---|
| `lanzamiento` | Lanzamiento | sí |
| `evergreen` | Evergreen | no |
| `renovacion` | Renovación | no |
| `achievers_live` | Achievers Live | sí |
| `evento_presencial` | Evento presencial | sí |
| `workshop_online` | Workshop online | sí |
| `ascension` | Ascensión | no |

Una modalidad creada a mano después de esas siete lleva código `MOD-00000`. La
pantalla de Modalidades del admin de ACS **no muestra el código**, así que para
una nueva hay que mirarla en el SQL editor de Supabase
(`select codigo, nombre from modalidades where deleted_at is null order by orden`)
o probar el endpoint, que devuelve el nombre y confirma el código:

```bash
curl -s -H "x-api-key: $SALES_METRICS_API_KEY" \
  "$SALES_METRICS_URL?projectCode=lanzamiento&dateStart=2026-08-01&dateEnd=2026-08-31&incluir=productos"
```

**ID del producto VIP.** Esa misma llamada lista los productos que vendió la
modalidad en el rango, con su `producto_id` y su nombre: de ahí sale el UUID sin
entrar a ningún lado. El VIP canónico hoy es
`fb8eab8b-f587-4fd7-83be-bc2c16779a61`.

**ID de la edicion (opcional pero recomendado).** UUID de `ediciones`. Ya no hace
falta el SQL editor: `?modalidades=1` lista las modalidades con su código, su
`usa_edicion` y sus ediciones con id y nombre.

```bash
curl -s -H "x-api-key: $SALES_METRICS_API_KEY" "$SALES_METRICS_URL?modalidades=1"
```

Ojo con dos casos que devuelve ese listado: en `evento_presencial` las
"ediciones" son tipos de evento (*Chinchuliders*, *Jornada Flowin*) y no tandas,
así que ahí la edición no aísla un lanzamiento; y `workshop_online` declara
`usa_edicion: true` sin tener ninguna edición creada, con lo que mandar
`edicionId` da 404 y no mandarlo devuelve la modalidad entera.

## Reglas del indicador

- **Configuración por proyecto** (migración `drizzle/0009_project_sales_system_link.sql`):
  `proyecto.sales_project_code` (código de la modalidad) y
  `proyecto.vip_product_id` (UUID del producto VIP). Sin ambos, la tarjeta
  muestra "no configurado" y no se consulta nada.
- **Qué cuenta como venta.** Filas de `pagos` con `estado = 'completado'` y
  `deleted_at` nulo de esa modalidad. Desde ACS-127 el endpoint separa **ventas**
  (el cobro que NO paga una cuota de un plan ya vendido) de **cobros** (toda fila
  de `pagos`); antes contaba cobros como ventas e inflaba el número de un
  producto en cuotas. El acceso VIP es pago único, así que las dos cifras
  coinciden. El desglose **diario** por producto contaba cobros y no ventas; eso
  también está corregido del lado de ACS.
- **Alcance más grueso que antes.** Una modalidad agrupa TODAS sus ediciones, no
  un lanzamiento. Lo que aísla un lanzamiento es el rango de fechas del dash más
  el `vip_product_id`; por eso la tarjeta lee `ventas_por_producto` y nunca el
  `cantidad_ventas` de la modalidad entera. Dos proyectos del dashboard con
  rangos superpuestos sobre la misma modalidad verían las mismas ventas.
- **La edición, ya disponible.** Cuando el proyecto tiene `sales_edition_id`, el
  dashboard manda `edicionId` y compara `meta.filters.edicionId` en la respuesta.
  El endpoint devuelve ese eco desde su despliegue actual, así que el aviso de la
  tarjeta solo aparecería si alguien desplegara una versión anterior. El pedido
  original (`PEDIDO-LEGACY-METRICS-EDICION.md`, raíz de ese repo) está atendido en
  sus cuatro puntos.
- **🔴 Sin `sales_edition_id`, la tarjeta informa la modalidad ENTERA y no lo
  dice.** El aviso solo salta cuando el eco no coincide, no cuando el campo está
  vacío. Medido el 2026-09-05 sobre el proyecto 4, que lo tenía vacío: la
  modalidad `lanzamiento` daba 2.919 ventas y 1.718.560,55 USD contra las 2.074 y
  56.133,00 de su edición — treinta veces la facturación, porque mayo 2026 vendió
  el curso y septiembre por ahora solo entradas VIP. En unidades del producto VIP
  la diferencia era de UNA venta, que es lo que había ocultado el problema: la
  tarjeta lee `ventas_por_producto` y ahí casi no se notaba.
- **Rango de fechas.** El del dash. El endpoint filtra por `fecha_pago` y, si es
  nulo, por `created_at`. El día de cada pago se parte en **`America/Montevideo`**
  (antes UTC), así que un lanzamiento que cierra de noche ya no aparece repartido
  en dos días.
- **Denominador.** Teléfonos únicos que entraron a algún grupo dentro del rango
  del dash y que **no habían salido** al cerrar el rango. Un mismo teléfono en
  varios grupos cuenta una vez. Antes contaba a quien ya se había ido, así que el
  porcentaje sube a medida que se acumulan salidas: es una corrección, no una
  mejora del embudo ([ADR 0016](adr/0016-grupos-event-log.md)).
- **Sin cruce con leads.** El sistema comercial ya sabe a qué modalidad pertenece
  cada venta, así que no se cruza por email ni teléfono.
- **Sin desglose por origen.** La serie diaria de ventas VIP ignora el filtro de
  origen de la gráfica (el sistema comercial no guarda el origen del lead); la
  gráfica lo advierte cuando hay un origen seleccionado.

## Estas ventas también viven en `Evergreen`

Desde 2026-09-05 un cron del dashboard copia estas mismas cifras, día a día, a
`acs_ventas_diarias` y `acs_ventas_producto_diarias`, para que el endpoint de
series y el túnel de métricas puedan servirlas sin salir a la red. El contrato
está en `docs/db/acs_ventas_diarias.md`.

La tarjeta VIP **no** lee esas tablas: sigue preguntando en vivo. Las dos fuentes
pueden por tanto diferir por lo que la ingesta lleve de retraso — hasta tres
horas, que es su cadencia.

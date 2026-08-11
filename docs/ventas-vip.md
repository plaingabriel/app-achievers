# Ventas VIP — contrato dashboard ↔ `achievers-comercial-system`

Indicador de ventas de accesos VIP en el dash de un proyecto
(`/proyectos` → pestaña **dash**): número de ventas y porcentaje sobre los leads
que entraron a grupos, más una cuarta serie en la gráfica diaria.

## De dónde salen los datos

Las ventas viven en **`achievers-comercial-system`** (la plataforma de ventas,
https://market.achievers.es), sobre Supabase. No están en `Evergreen` ni las
gestiona `server-achievers`.

> Histórico: la primera versión leía Notion (Ventas Achievers) a través de
> `server-achievers`. Quedó obsoleta — el producto VIP dejó de registrarse ahí
> cuando las ventas se movieron al sistema comercial.

En el sistema comercial **no hay tabla `ventas`**: lo que la UI "Mis Ventas"
lista son filas de `pagos` (los códigos `VTA-…` son `pagos.codigo`), unidas a
`productos` → `proyectos`.

## El endpoint

`GET {SALES_METRICS_URL}` → Edge Function `public-project-metrics`
(por defecto `https://bgbbckfqdplingyhnmbn.supabase.co/functions/v1/public-project-metrics`).

Autenticación: cabecera `x-api-key` con `PUBLIC_PROJECT_METRICS_API_KEY`
(secret de Supabase). En el dashboard es `SALES_METRICS_API_KEY`.

| Query param | Obligatorio | Formato |
|---|---|---|
| `projectCode` | sí (o `projectId`) | `proyectos.codigo`, p. ej. `PRY-00012` |
| `dateStart` | no | `YYYY-MM-DD` |
| `dateEnd` | no | `YYYY-MM-DD` |
| `groupBy` | no | `dia` — añade `metricas.ventas_por_dia` |

El dashboard siempre envía `projectCode`, el rango del dash y `groupBy=dia`.
Respuesta relevante:

```json
{
  "success": true,
  "data": {
    "proyecto": { "id": "uuid", "codigo": "PRY-00012", "nombre": "…", "estado": "activo" },
    "metricas": {
      "cantidad_ventas": 187,
      "ventas_por_producto": [
        { "producto_id": "uuid", "producto_nombre": "Entrada VIP - Desafio Importador",
          "cantidad_ventas": 187, "facturacion_por_moneda": [ … ] }
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

El desglose diario (`groupBy=dia`) se añadió para este indicador; sin ese
parámetro la respuesta es exactamente la de antes. La documentación completa del
endpoint está en `ENDPOINTS_PUBLICOS.txt` del repo del sistema comercial.

## Reglas del indicador

- **Configuración por proyecto** (migración `drizzle/0009_project_sales_system_link.sql`):
  `proyecto.sales_project_code` (el `codigo` autogenerado del proyecto
  en el sistema comercial, formato `PRY-00000`) y `proyecto.vip_product_id` (el UUID del producto VIP). Sin ambos,
  la tarjeta muestra "no configurado" y no se consulta nada.
- **Qué cuenta como venta.** Lo mismo que la lista "Mis Ventas" del sistema
  comercial: filas de `pagos` con `estado = 'completado'` y `deleted_at` nulo,
  del proyecto indicado. Ojo: son **pagos**, no ventas lógicas — un producto en
  cuotas contaría un pago por cuota. El acceso VIP es pago único, así que ahí
  coinciden.
- **Rango de fechas.** El del dash. El endpoint filtra por `fecha_pago` y, si es
  nulo, por `created_at`; el día de cada pago se toma en UTC, igual que el filtro.
- **Denominador.** Teléfonos únicos en `grupos` dentro del rango del dash. Un
  mismo teléfono en varios grupos cuenta una vez.
- **Sin cruce con leads.** El sistema comercial ya sabe a qué proyecto pertenece
  cada venta, así que no se cruza por email ni teléfono.
- **Sin desglose por origen.** La serie diaria de ventas VIP ignora el filtro de
  origen de la gráfica (el sistema comercial no guarda el origen del lead); la
  gráfica lo advierte cuando hay un origen seleccionado.

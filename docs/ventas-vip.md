# Ventas VIP — contrato dashboard ↔ `server-achievers`

Indicador de ventas de accesos VIP en el dash de un proyecto
(`/proyectos` → pestaña **dash**): número de ventas y porcentaje sobre los leads
que entraron a grupos, más una cuarta serie en la gráfica diaria.

## De dónde salen los datos

Las ventas **no** están en `Evergreen`. Viven en la base de Notion
**Ventas Achievers**, que solo `server-achievers` puede leer. El servidor no las
crea para el producto VIP: llegan desde fuera (checkout / automatización de
Notion) y el servidor únicamente completa la propiedad `Closer` a partir de un
Google Form (`src/modules/appscript/services/vip-google-form-to-notion.service.ts`).

Propiedades relevantes de Ventas Achievers:

| Propiedad | Tipo | Uso aquí |
|---|---|---|
| `Producto Adquirido` | multi_select | Filtro del producto VIP |
| `Fecha de Compra` | date | Filtro de rango y agrupación diaria |
| `Email` | email | Cruce con `registros.correo` |
| `Telefono` | phone_number | Cruce con `registros.telefono` / `grupos.telefono` |
| `Nombre Completo`, `Monto Pagado (USD)`, `Status`, `Closer`, `Origen` | varios | Se devuelven, hoy solo informativos |

## El endpoint

`GET {SERVER_URL}/ventas/por-producto`

| Query param | Obligatorio | Formato |
|---|---|---|
| `producto` | sí | Nombre exacto de la opción en `Producto Adquirido` |
| `dateStart` | sí | `YYYY-MM-DD` |
| `dateEnd` | sí | `YYYY-MM-DD` |
| `refresh` | no | `1` / `true` salta la caché |

Respuesta:

```json
{
  "producto": "Entrada VIP - Desafio Importador",
  "dateStart": "2026-08-01",
  "dateEnd": "2026-08-31",
  "generatedAt": "2026-08-10T12:00:00.000Z",
  "cached": false,
  "total": 12,
  "ventas": [
    {
      "id": "notion-page-id",
      "nombre": "Nombre Apellido",
      "email": "persona@example.com",
      "telefono": "+54 9 11 ...",
      "fecha": "2026-08-03",
      "fechaKey": "2026-08-03",
      "monto": 97,
      "status": "Pago Completo",
      "closer": "Gabriela Aguirre",
      "origen": "Evergreen"
    }
  ]
}
```

`fechaKey` es `Fecha de Compra` recortada a `YYYY-MM-DD`: el dashboard agrupa por
ese valor para no depender de la zona horaria al parsear.

Implementación en el servidor: `src/modules/ventas/` (ruta, controller, schema
zod y `services/ventas-por-producto.service.ts`). El resultado se cachea 10
minutos en memoria por `producto + rango`.

### Autenticación (opcional)

El endpoint devuelve datos personales del comprador. Si `VENTAS_API_KEY` está
definida en el `.env` del servidor, cada petición debe traer la cabecera
`x-api-key` con ese valor; el dashboard la envía desde `SERVER_API_KEY`
(`src/lib/env.ts`). Si la variable no está definida en el servidor, el guard
queda desactivado y el endpoint se comporta como el resto del servidor.

## Reglas del indicador

- **Producto por proyecto.** `proyecto.vip_product_name` (migración
  `drizzle/0008_project_vip_product_name.sql`) guarda el nombre del producto. Sin
  él, la tarjeta muestra "no configurado" y no se consulta nada.
- **Atribución.** Una venta cuenta para el proyecto si su email coincide con
  `registros.correo` o su teléfono con `registros.telefono` / `grupos.telefono`
  (teléfonos normalizados, `54…` y `549…` se tratan igual). Las ventas del
  producto que no cruzan con ningún lead se muestran aparte como "Ventas sin
  lead" y **no** entran en el porcentaje.
- **Sin filtro por `Status`.** Toda fila con el producto dentro del rango cuenta
  como venta, incluidas `Seña`, `Cuotas` y `--`.
- **Denominador.** Teléfonos únicos en `grupos` dentro del rango de fechas del
  dash. Un mismo teléfono en varios grupos cuenta una vez.
- **Rango.** El del dash (`dateStart`/`dateEnd`); el cruce con leads usa todos
  los registros del proyecto, no solo los del rango.

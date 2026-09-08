# `leads_etapa` — el embudo del lead, y sus dos etapas medidas

Serie diaria por proyecto y etapa, servida por
`Metricas`.`v_leads_etapa_diarias` y publicada como `metrica=leads_etapa` en
`/api/public/proyectos/:id/series`. A diferencia de `meta_ads_diarias` o
`acs_ventas_diarias`, **no hay tabla nueva ni escritor nuevo**: la vista lee
`registros` y `grupos`, que ya existían.

Este archivo está sobre todo para lo que la vista **no** puede responder.

## Las seis etapas son el vocabulario del panel

Fijas y en este orden — así compara edición contra edición:

| # | `etapa` | Qué es | Fuente |
|---|---|---|---|
| 1 | `registro` | Se registró en la landing | `registros`, `DATE(created_at)` |
| 2 | `captacion_inicio` | Entró a la API de WhatsApp | **ninguna** |
| 3 | `nombre` | Dio nombre y correo dentro de la API | **ninguna** |
| 4 | `clic_grupo` | Tocó el enlace del grupo | **ninguna** |
| 5 | `confirmado_grupo` | Quedó dentro del grupo | `grupos`, `evento='entrada'`, `DATE(fecha)` |
| 6 | `info_clase` | Recibió la info de la clase | **ninguna** |

Es el embudo que el debrief de Black Friday publicó en Notion:

```
Registro ............................ 15.364
Captación inicio (entró a la API) ... 12.133
Dio nombre y correo ................. 11.847
Hizo clic al grupo de WhatsApp ......  8.804
Confirmó en el grupo ................  8.591
Recibió la info de la clase .........  6.935
```

Se cargó a mano, y **cuatro de las seis se siguen cargando a mano**, porque
ocurren dentro de ManyChat y ninguna fila de `Evergreen` las registra.
Comprobado el 2026-09-08 en los dos repositorios: `server-achievers` llama a la
API de ManyChat (`create-contact`, `trigger-automation`, `sendFlow`) y no
escribe nunca una etapa de vuelta — sus dos únicos escritores en este esquema
son `sells` y `meta_ads_diarias`. SendFlow avisa cuando alguien entra o sale de
un grupo, que es la etapa 5, y nada más.

## Una etapa sin fuente sale ausente, nunca en cero

El `0` es una medición: ese día nadie llegó a esa etapa. La ausencia es "nadie
lo mide". Devolver `0` para `captacion_inicio` diría que el embudo se cortó
entero en la etapa 2, que es exactamente lo contrario de lo que pasa.

El catálogo lo dice sin que el panel tenga que deducirlo: la entrada de
`leads_etapa` publica `etapas` (las seis, en orden) y `etapasConDatos` (las dos
que hoy tienen fuente). El hueco es de origen, no un día sin datos.

## Cómo se llenan las otras cuatro

Hace falta una ingesta que escriba, por proyecto y día, cuántos contactos
alcanzaron cada etapa en ManyChat — una tabla propia como `meta_ads_diarias`,
escrita por quien puede leer esa cuenta. Cuando exista, se agrega un `UNION ALL`
a la vista y se listan las etapas en `etapasConDatos`. **Ni el endpoint ni el
panel cambian**: el vocabulario ya está publicado y el desglose ya se dibuja.

Lo que no sirve: deducirlas de lo que hay. `encuestas` no es ninguna de las seis
—es el formulario de Lead Score, un paso distinto del mismo lanzamiento— y
usarla como `nombre` o como `info_clase` daría una serie con nombre de una cosa
y valores de otra.

## Dos relojes en la misma serie

`registro` cuenta por `registros.created_at`, el momento del alta.
`confirmado_grupo` cuenta por `grupos.fecha`, la fecha para la que es la
asignación de SendFlow, igual que la métrica `grupos`. Un lote de grupos cargado
por adelantado cae en su propio día. **Un día suelto del embudo mezcla los dos
relojes; una ventana de lanzamiento entero, no.**

## `confirmado_grupo` cuenta entradas, no miembros

Es `COUNT(*)` sobre `grupos` con `evento='entrada'`, así que un lead agregado a
dos grupos cuenta dos veces y uno que se fue sigue contado. Es la misma cifra que
la métrica `grupos` y arrastra la misma advertencia:
[`ingesta-publica.md`](./ingesta-publica.md) mide la diferencia contra SendFlow
—100.849 entradas contra 22.741 salidas en el lanzamiento de septiembre— y
explica por qué la pertenencia actual no se puede calcular todavía. Sobreestima
la etapa 5 en aproximadamente un cuarto.

## Lectores

- El panel externo de métricas, vía `?metrica=leads_etapa&agrupar=etapa`.
- **Nadie más.** `agrupar` es obligatorio en esta métrica: sin él la respuesta
  sería la suma de tramos de un mismo embudo, que cuenta al mismo lead una vez
  por tramo. El endpoint devuelve `400` diciendo eso.

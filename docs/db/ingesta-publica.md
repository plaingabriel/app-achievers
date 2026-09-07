# Public ingest contract — `registros`, `encuestas`, `grupos`

The three tables behind the project dash are filled by **three different outside
writers**, over three public `POST` endpoints. They share a guard and nothing
else: different sources, different payload shapes, different failure modes. This
file is the contract; `src/lib/proyectos-registros-api.ts` is the implementation.

Common to all three:

- `proyectoId` comes from the query string (`?proyectoId=4`) or the body.
- **CORS allowlist, not authentication.** `assertPublicIngestOrigin` rejects a
  browser `Origin` outside `achievers.es`, `www.achievers.es`,
  `server.achieversacademy.es`, `desafioimportador.com`, `www.desafioimportador.com`.
  A request with **no** `Origin` header — every server-to-server webhook, SendFlow
  included — passes unchecked. These endpoints are open to anyone who knows the
  URL and a project id; the guard stops a hostile web page, not a script.
- Bodies may use `form_fields[nombre]` style keys as well as plain ones.

## `registros` ← the landing forms

`POST /api/registros`. Requires `nombre` and `correo` (`email` also accepted);
`telefono` optional. `origen` is taken from `origen`, then `utm_content`, then
the same two inside `metadata`, and falls back to `Sin origen`. Everything else
in the body is kept in `metadata`.

The `form_fields[…]` keys and the `utm_content` fallback are what identify the
writer: a landing-page form on the allowlisted domains. **Not SendFlow** — the
sendhook payload carries no name and no email, which this endpoint requires.

## `encuestas` ← the Lead Score survey form

`POST /api/encuestas`. This is the one nobody could place, so, plainly: it is a
**second form, filled by someone who already registered**, on the same landing
domains. There is no third system involved.

The proof is in the contact resolution. The body sends `correo` (or `email`), an
optional `score`, and any other field, which all land in `respuestas` as JSON.
The endpoint then calls `resolveEncuestaContactId`, which looks up the **most
recent `registro` with that email in that project** and stores its `id` as
`contact_id` — and **404s with "No existe un registro para ese correo en este
proyecto" when there is none**. A survey therefore cannot exist before its lead
does. `contact_id` is a `registros.id` rendered as a string, not an id from any
external system.

A caller may bypass that by sending `contactId` directly, in which case the value
is stored verbatim and nothing verifies it points anywhere. Nothing in the app
does this today.

That the two are the same funnel is visible in the volumes: on
*[0926] Lanzamiento — Desafío Importador*, 146.946 registros against 117.812
encuestas — 80 %, the shape of a follow-up form, not of an independent source.

## `grupos` ← the SendFlow sendhook

`POST /api/grupos?proyectoId=<id>`, configured in SendFlow under
**Sendhooks → HTTP**. Both group events post to that one URL.

The endpoint reads the flat keys first and then falls back to SendFlow's nesting:

| Column | Read from |
|---|---|
| `telefono` | `data.number` |
| `campana` | `data.campaignName` |
| `grupo` | `data.groupName` |
| `fecha` | `data.createdAt_with_timezone_br`, else `data.createdAt` |

`data.campaignId`, `data.groupId` and `data.groupJid` are received and dropped;
`campana` and `grupo` are stored as free text, so a campaign renamed in SendFlow
splits into two values here.

### The two events are identical except for one field

```jsonc
{ "id": "27392B51F1EDD330", "event": "group.updated.members.added",   "data": { … }, "version": "1.0.0" }
{ "id": "AE0D546548577137", "event": "group.updated.members.removed", "data": { … }, "version": "1.0.0" }
```

Same `data` shape, same fields, same everything. **`event` is the only signal, and
the endpoint does not read it.**

### Consequence: enabling "Miembro removido" would store exits as entries

Nothing in `createGrupo` inspects `event`, so a removal would be inserted as an
ordinary row and would inflate the very metric it should reduce. Such a row is
**unrecoverable**: the two payloads differ only in the field that was never
stored, so no query could tell them apart afterwards.

**The event has never been activated** — confirmed with Woker on 2026-09-07; what
appears ticked in the SendFlow screenshot was an unsaved preview. So `grupos`
holds entries only, and no cleanup is owed. Keep it that way until `evento` ships
([ADR 0016](../adr/0016-grupos-event-log.md)).

### `grupos` counts entries, so it cannot report membership

Measured on 2026-09-07 for *[0926] Desafío Importador*:

| | SendFlow | `grupos` |
|---|---|---|
| Ingresaron | 100.849 | 100.655 rows |
| Salieron | 22.741 | not recorded |
| Participantes (current) | 79.196 | **cannot be computed** |

The dashboard is within 0,2 % of SendFlow on entries and cannot produce the third
row at all, because it never learns that anyone left. So "Leads en grupos de WSP"
overstates who is actually in the groups by roughly a quarter.

Two caveats before anyone tries to reconcile these exactly: SendFlow's entries and
exits are a **90-day window** while participants is a **current total** (100.849 −
22.741 = 78.108, not 79.196), and the dashboard figure is all-time for the
project. They are the same order of magnitude, not the same measurement.

**This also skews the VIP conversion rate.** Its denominator is unique phones in
`grupos` over the dash range (`docs/ventas-vip.md`), which counts people who left.
The percentage is therefore reported lower than it is.

### `server-achievers` receives the same sendhook, and drops `event` too

`POST {SERVER_URL}/sendflow/:idSheets/:indexSheets`
(`src/modules/sendflow/`) appends SendFlow events to a Google Sheet. Its zod
schema **validates `event`** — it is the only place in either repo that admits
the field exists — and then `mapSendflowRow` writes four columns without it:
`Fecha y Hora`, `Telefono`, `Campaña`, `Grupo`. Two things follow if the removal
event is ever enabled on a hook pointing there:

- That sheet gains exit rows indistinguishable from entries, same as `grupos`.
- Each one **triggers a ManyChat automation** (`automation_id
  content20260404162013_976768`) against the number — the welcome flow, fired at
  someone who just left.

`Fecha y Hora` is also `new DateARG().toShortDateTime()`, the moment the server
processed the row, not `data.createdAt`. The dashboard stores the payload date.
The two are not the same clock and should not be reconciled row by row.

### No idempotency key

`grupos` has indexes on `proyecto_id`, `telefono` and `fecha`, and no unique
constraint. A redelivered sendhook — SendFlow retrying a timeout — inserts a
second identical row and every count moves. The payload's top-level `id` is a
per-delivery identifier and is the natural key to dedupe on; ADR 0016 stores it.

# Public ingest contract — `registros`, `encuestas`, `grupos`

The three tables behind the project dash are filled by **four different outside
writers**, over three public `POST` endpoints — `registros` has two. They share a
guard and nothing else: different sources, different payload shapes, different
failure modes. This file is the contract;
`src/lib/proyectos-registros-api.ts` is the implementation.

Common to all four:

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

## `registros` ← the sorteo popup (second writer, own project)

`POST /api/registros?proyectoId=11`, project **`Sorteo Importador PRO Septiembre
2026`**. The writer is an inline HTML widget in an Elementor block on
`desafioimportador.com/sorteo-importador/`: a popup that asks for name, email and
WhatsApp plus three questions, and redirects to `/gracias-sorteo/` on submit.
Live since 2026-09-18 14:18:37 UTC.

The three answers ride in `metadata`, because `readMetadata` keeps every key that
is not one of `proyectoId/nombre/correo/email/telefono/origen/metadata`. A row
looks like this:

| Field | Value |
|---|---|
| `nombre` / `correo` | as typed |
| `telefono` | E.164, no space (`+541131383014`) — the widget concatenates the dial code |
| `origen` | `utm_content` URL-decoded, else `Sorteo directo` |
| `metadata.tipo` | always `sorteo` |
| `metadata.motivo` / `.capital` / `.razon` | the three survey answers |
| `metadata.pais` / `.pais_nombre` | ISO code (`AR`) and name (`Argentina`) |
| `metadata.whatsapp` | the raw national number, as typed |
| `metadata.pagina` | the full landing URL, `utm_*` and `fbclid` included |

### Why its own project, and why one call

The sorteo is part of the 0926 launch commercially, and it still does **not**
belong in project 4. Two reasons, both structural:

- `v_encuestas_diarias` counts `COUNT(*)`, so filing these answers as `encuestas`
  would inflate the launch's survey KPI with a different questionnaire, and mix
  two unrelated schemas into the same CSV export.
- Worse, `resolveEncuestaContactId` attaches a survey to the **most recent**
  `registro` with that email in the project. A participant who entered the sorteo
  and then answered the Lead Score form would have their score credited to the
  sorteo's `origen` in `v_scores_por_origen` instead of to the ad that brought
  them in. A separate project removes that coupling entirely.

And one call, not two, because the widget has a single `FORM_URL` and
`/api/encuestas` **404s when no `registro` exists for that email in that
project** — a participant who was not already a launch lead could never be
stored.

### The cross against the launch is by `correo`, never by `contact_id`

`encuestas.contact_id` points at a `registros.id` of project 4, so it cannot
reach project 11. Join the two projects on `correo`, taking the **oldest**
launch `registro` (it carries the acquisition origin, the ad that opened the
funnel) and the **most recent** survey. Expect roughly 81 % coverage: that is the
share of project 4's unique emails that have a Lead Score survey at all.

### Two failure modes, both learned the hard way on 2026-09-18

**A blank `FORM_URL` loses data in total silence.** `send()` returns before any
network call when the URL is empty, and the form still redirects to the thank-you
page, so the participant sees success and nothing is written anywhere. The widget
ran that way from early morning until 14:18:37 UTC. Those submissions **never
left the browser** and are unrecoverable — not a failed request, not a queue, not
a log line. If this widget is ever redeployed, verify a row lands in the database
before trusting the page.

**Cloudflare caches the page HTML, and that has two consequences.** Both
`/sorteo-importador/` and `/gracias-sorteo/` answer with `cf-cache-status: HIT`:

- **There is no server-side trace of a visit.** The origin's LiteSpeed access log
  (`/usr/local/lsws/logs/access.log`, behind a DO load balancer) has *zero* lines
  for either path on a day with thousands of visits, while `wp-admin` and
  `wp-json` log normally. Do not plan any forensics on that log; the count lives
  in client-side analytics, which the edge cache does not intercept.
- **A widget edit is not live until the cache is purged.** An Elementor save that
  appears not to persist is almost always the edge still serving the old HTML.

### `origen` is always re-derivable

`metadata.pagina` keeps the full landing URL, so `origen` can be rebuilt at any
time by parsing `utm_content` out of it — which is how the 460 rows written
before the widget started reading the parameter were backfilled. Decode with
`unquote_plus`, not a `+`→space replace: some rows arrive percent-encoded
(`Sorteo%20Woker%20Ad%203`) and would otherwise split into a separate origin.
`{{ad.name}}` appears verbatim when a Meta ad ships without the macro
substituted; project 4 carries about 1.530 of those too, so it is an ad
misconfiguration upstream, not an ingest bug.

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
| `evento` | `event`, mapped (see below) |
| `evento_id` | top-level `id` |

`data.campaignId`, `data.groupId` and `data.groupJid` are received and dropped;
`campana` and `grupo` are stored as free text, so a campaign renamed in SendFlow
splits into two values here.

### The two events are identical except for one field

```jsonc
{ "id": "27392B51F1EDD330", "event": "group.updated.members.added",   "data": { … }, "version": "1.0.0" }
{ "id": "AE0D546548577137", "event": "group.updated.members.removed", "data": { … }, "version": "1.0.0" }
```

Same `data` shape, same fields, same everything. `event` is the only signal.

`createGrupo` now maps it: `…members.added` → `evento = 'entrada'`,
`…members.removed` → `'salida'`, and **any other value is a 400** rather than a
row filed as an entry ([ADR 0016](../adr/0016-grupos-event-log.md)). The
top-level `id` is stored as `evento_id`, unique, so a redelivered sendhook
returns the row already stored instead of adding a second one. A body with no
`event` — the admin importer, a manual call — keeps the column default,
`'entrada'`.

Migration `0013` is applied and the endpoint above is live. Verified against
production on 2026-09-07 over project 5: an `added` payload stored `entrada`, a
`removed` one `salida`, the same delivery `id` sent twice returned the first row
instead of writing a second, and `group.updated.members.promoted` was rejected
with 400 and wrote nothing.

Had the event been enabled before the migration landed, those rows would have
been **unrecoverable**: the two payloads differ only in the field that was not
stored, so no query could have told them apart afterwards.

### Entries and membership are two different figures

Measured on 2026-09-07 for *[0926] Desafío Importador*, before exits were being
recorded:

| | SendFlow | `grupos` |
|---|---|---|
| Ingresaron | 100.849 | 100.655 rows |
| Salieron | 22.741 | 0 rows, none had been sent yet |
| Participantes (current) | 79.196 | equal to entries until exits arrive |

Membership is derived, never stored: a phone is in a group while its `entrada`
count for that `(telefono, grupo)` exceeds its `salida` count.
`grupos_proyecto_telefono_grupo_idx` exists to serve that grouping.

**History is one-sided.** Exits are only known from the day the event was
switched on in SendFlow. Over any earlier range membership equals entries — not
because nobody left, but because nobody recorded it. The dash says so: a project
with no exits on record labels the figure as such instead of implying it counted
departures.

Two caveats before anyone reconciles these against SendFlow exactly: its entries
and exits are a **90-day window** while participants is a **current total**
(100.849 − 22.741 = 78.108, not 79.196), and the dashboard figure is all-time for
the project. They are the same order of magnitude, not the same measurement.

**The VIP conversion rate moves with this.** Its denominator is unique phones
that entered a group in the dash range and had not left by its close
(`docs/ventas-vip.md`). It used to count people who had walked out, so the
percentage was reported lower than it was; it rises as exits accumulate, and that
is a correction, not a regression.

### `server-achievers` receives the same sendhook, and drops `event` too

`POST {SERVER_URL}/sendflow/:idSheets/:indexSheets`
(`src/modules/sendflow/`) appends SendFlow events to a Google Sheet. Its zod
schema **validates `event`** — it is the only place in either repo that admits
the field exists — and then `mapSendflowRow` writes four columns without it:
`Fecha y Hora`, `Telefono`, `Campaña`, `Grupo`. **"Miembro removido" therefore
belongs only on the hook pointing at `/api/grupos`.** Tick it on one pointing
there and two things follow:

- That sheet gains exit rows indistinguishable from entries, same as `grupos`.
- Each one **triggers a ManyChat automation** (`automation_id
  content20260404162013_976768`) against the number — the welcome flow, fired at
  someone who just left.

`Fecha y Hora` is also `new DateARG().toShortDateTime()`, the moment the server
processed the row, not `data.createdAt`. The dashboard stores the payload date.
The two are not the same clock and should not be reconciled row by row.

### Idempotency

Until migration `0013`, `grupos` had no unique constraint: a redelivered
sendhook — SendFlow retrying a timeout — inserted a second identical row and
every count moved. `evento_id` closes that. It is nullable, because rows written
before the migration and rows created by hand through the admin have no delivery
id, and MySQL lets a unique index hold any number of NULLs.

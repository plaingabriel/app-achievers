# Runbook — rate limit de la ingesta pública

Qué hace y por qué está así: [ADR 0017](../adr/0017-ingest-rate-limiting.md).
Implementación: `src/lib/rate-limit.ts`.

## Variables

Viven en `$SSH_PATH/.env` del droplet (`/home/deploy/app-achievers/.env`).

| Variable | Default | Qué hace |
|---|---|---|
| `INGEST_RATE_LIMIT_MODE` | `shadow` | `off`, `shadow` (cuenta y registra, no bloquea), `enforce` |
| `INGEST_RATE_LIMIT_MAX` | `5` | Solicitudes permitidas por IP y proyecto dentro de la ventana |
| `INGEST_RATE_LIMIT_WINDOW_MS` | `3600000` | Ventana, en milisegundos |
| `INGEST_RATE_LIMIT_PROJECTS` | `11` | **Lista opt-in**: solo estos proyectos se limitan |
| `INGEST_RATE_LIMIT_EXEMPT_IPS` | *(vacío)* | Válvula de emergencia: IPs exentas |

**No agregues 1, 2 ni 4 a `INGEST_RATE_LIMIT_PROJECTS`.** Esos proyectos reciben
~160.000 registros servidor-a-servidor desde cuatro IPs fijas de WordPress (una
sola mandó 144.942). Limitarlos deja el embudo de lanzamiento fuera de servicio.

## Cambiar el modo (sin rebuild, ~10 segundos)

```bash
ssh deploy@195.200.2.171
cd /home/deploy/app-achievers
nano .env                                              # editar INGEST_RATE_LIMIT_MODE
pm2 startOrReload ecosystem.config.cjs --update-env    # --update-env es obligatorio
pm2 logs app-achievers --lines 20
```

Sin `--update-env`, pm2 reinicia el proceso con el entorno viejo y el cambio no
tiene efecto. La vuelta atrás es el mismo procedimiento.

## Pasar de sombra a bloqueo

1. Dejar `shadow` **al menos 48 h**, cubriendo un pico real de tráfico (un día de
   lanzamiento y un empuje del sorteo).
2. Revisar qué se habría bloqueado. `error_log` se purga a los 7 días, así que
   hay que mirar dentro de esa ventana:

```sql
SELECT metadata->>'$.ip' AS ip, metadata->>'$.proyectoId' AS proyecto,
       metadata->>'$.userAgent' AS ua, COUNT(*) n,
       MIN(created_at) AS primera, MAX(created_at) AS ultima
FROM error_log
WHERE source = 'ingest-rate-limit' AND created_at > NOW() - INTERVAL 7 DAY
GROUP BY 1, 2, 3
ORDER BY n DESC;
```

3. **Criterio para activar:** que toda IP de esa lista sea un abuso conocido o,
   cruzada contra `audit_log`, no tenga un patrón plausible de usuario único.
   Una IP de datacenter con user agent de WordPress es señal de alto: investigar
   antes de bloquear.
4. Poner `enforce` con el procedimiento de arriba.

## Cuando alguien reporta que no puede registrarse

```sql
SELECT * FROM error_log
WHERE source = 'ingest-rate-limit' AND metadata->>'$.ip' = '<IP>'
ORDER BY id DESC LIMIT 5;
```

Si es un falso positivo y hace falta desbloquear ya, agregar la IP a
`INGEST_RATE_LIMIT_EXEMPT_IPS` (separadas por coma) y recargar. Es una medida
temporal: si reaparece, el umbral está mal calibrado y hay que subir
`INGEST_RATE_LIMIT_MAX`.

## Comprobar que está vivo

Los contadores se pierden en cada `pm2 reload`, así que tras un deploy la primera
ventana arranca de cero. Para verificar en local (`pnpm dev`, sin nginx, la IP se
manda a mano):

```bash
INGEST_RATE_LIMIT_MODE=enforce INGEST_RATE_LIMIT_MAX=2 \
INGEST_RATE_LIMIT_WINDOW_MS=60000 INGEST_RATE_LIMIT_PROJECTS=11 pnpm dev

for i in 1 2 3; do
  curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:3000/api/registros \
    -H 'content-type: application/json' -H 'X-Real-IP: 203.0.113.9' \
    -H 'Origin: https://achievers.es' -d '{"proyectoId":11}'
done   # espera 400, 400, 429
```

**Usar exactamente ese cuerpo.** `pnpm dev` pega contra la base de producción por
el túnel: `{"proyectoId":11}` sin `nombre` se cuenta y después se rechaza con 400
sin escribir ninguna fila. Un cuerpo completo insertaría registros reales.

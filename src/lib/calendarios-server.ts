import { db } from '@/db/index';
import { calendarios } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { assertPermission, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Data CRUD for the schema-frozen `Calendarios` table (plan §4.1 / phase 08).
// pk_nombre is the natural key: supplied on create, immutable afterwards.
// `setter`/`activo` are tinyint(1) booleans. See personas-server.ts for the
// shared pattern and permission gating.

type CalendarioFields = {
  formId: string;
  landingId: string;
  funnel: string;
  setter: boolean;
  activo: boolean;
};

const orNull = (s: string) => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

const toRow = (f: CalendarioFields) => ({
  formId: orNull(f.formId),
  landingId: orNull(f.landingId),
  funnel: orNull(f.funnel),
  setter: f.setter,
  activo: f.activo,
});

export const fetchCalendariosData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertPermission('calendarios:read');
  const rows = await db.select().from(calendarios).orderBy(calendarios.pkNombre);
  return { calendarios: rows };
});

export const createCalendario = createServerFn({ method: 'POST' })
  .inputValidator((data: CalendarioFields & { pkNombre: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('calendarios:write');
      const pkNombre = data.pkNombre.trim();
      if (!pkNombre) return { ok: false, error: es.calendarios.nameRequired };

      const [existing] = await db
        .select({ pkNombre: calendarios.pkNombre })
        .from(calendarios)
        .where(eq(calendarios.pkNombre, pkNombre))
        .limit(1);
      if (existing) return { ok: false, error: es.data.duplicateKey };

      await db.insert(calendarios).values({ pkNombre, ...toRow(data) });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'calendario.created',
        targetType: 'calendario',
        targetId: pkNombre,
        metadata: { funnel: data.funnel },
      });
      return { ok: true };
    } catch (err) {
      logServerError('createCalendario', { pkNombre: data.pkNombre }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const updateCalendario = createServerFn({ method: 'POST' })
  .inputValidator((data: CalendarioFields & { pkNombre: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('calendarios:write');

      const [existing] = await db
        .select({ pkNombre: calendarios.pkNombre })
        .from(calendarios)
        .where(eq(calendarios.pkNombre, data.pkNombre))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.update(calendarios).set(toRow(data)).where(eq(calendarios.pkNombre, data.pkNombre));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'calendario.updated',
        targetType: 'calendario',
        targetId: data.pkNombre,
        metadata: { funnel: data.funnel },
      });
      return { ok: true };
    } catch (err) {
      logServerError('updateCalendario', { pkNombre: data.pkNombre }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deleteCalendario = createServerFn({ method: 'POST' })
  .inputValidator((data: { pkNombre: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('calendarios:delete');

      const [existing] = await db
        .select({ pkNombre: calendarios.pkNombre })
        .from(calendarios)
        .where(eq(calendarios.pkNombre, data.pkNombre))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.delete(calendarios).where(eq(calendarios.pkNombre, data.pkNombre));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'calendario.deleted',
        targetType: 'calendario',
        targetId: data.pkNombre,
      });
      return { ok: true };
    } catch (err) {
      logServerError('deleteCalendario', { pkNombre: data.pkNombre }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

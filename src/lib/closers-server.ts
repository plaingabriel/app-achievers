import { db } from '@/db/index';
import { closers } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { assertPermission, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Data CRUD for the schema-frozen `Closers` table (plan §4.1 / phase 08).
// pk_email is the natural key: supplied on create, immutable afterwards. Optional
// text fields store NULL when left blank (kept tidy via `orNull`). See
// personas-server.ts for the shared pattern and permission gating.

// Editable (non-key) fields, shared by create and update.
type CloserFields = {
  nombre: string;
  apellido: string;
  tagNotion: string;
  idNotion: string;
  formId: string;
  landingId: string;
  avatarUrl: string;
  funnel: string;
  calendlyUser: string;
  activo: boolean;
};

const orNull = (s: string) => {
  const t = s.trim();
  return t.length > 0 ? t : null;
};

const toRow = (f: CloserFields) => ({
  nombre: orNull(f.nombre),
  apellido: orNull(f.apellido),
  tagNotion: orNull(f.tagNotion),
  idNotion: orNull(f.idNotion),
  formId: orNull(f.formId),
  landingId: orNull(f.landingId),
  avatarUrl: orNull(f.avatarUrl),
  funnel: orNull(f.funnel),
  calendlyUser: orNull(f.calendlyUser),
  activo: f.activo,
});

export const fetchClosersData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertPermission('closers:read');
  const rows = await db.select().from(closers).orderBy(closers.pkEmail);
  return { closers: rows };
});

export const createCloser = createServerFn({ method: 'POST' })
  .inputValidator((data: CloserFields & { pkEmail: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('closers:write');
      const pkEmail = data.pkEmail.trim().toLowerCase();
      if (!pkEmail) return { ok: false, error: es.closers.emailRequired };

      const [existing] = await db
        .select({ pkEmail: closers.pkEmail })
        .from(closers)
        .where(eq(closers.pkEmail, pkEmail))
        .limit(1);
      if (existing) return { ok: false, error: es.data.duplicateKey };

      await db.insert(closers).values({ pkEmail, ...toRow(data) });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'closer.created',
        targetType: 'closer',
        targetId: pkEmail,
        metadata: { nombre: data.nombre },
      });
      return { ok: true };
    } catch (err) {
      logServerError('createCloser', { pkEmail: data.pkEmail }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const updateCloser = createServerFn({ method: 'POST' })
  .inputValidator((data: CloserFields & { pkEmail: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('closers:write');

      const [existing] = await db
        .select({ pkEmail: closers.pkEmail })
        .from(closers)
        .where(eq(closers.pkEmail, data.pkEmail))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.update(closers).set(toRow(data)).where(eq(closers.pkEmail, data.pkEmail));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'closer.updated',
        targetType: 'closer',
        targetId: data.pkEmail,
        metadata: { nombre: data.nombre },
      });
      return { ok: true };
    } catch (err) {
      logServerError('updateCloser', { pkEmail: data.pkEmail }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deleteCloser = createServerFn({ method: 'POST' })
  .inputValidator((data: { pkEmail: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('closers:delete');

      const [existing] = await db
        .select({ pkEmail: closers.pkEmail })
        .from(closers)
        .where(eq(closers.pkEmail, data.pkEmail))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.delete(closers).where(eq(closers.pkEmail, data.pkEmail));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'closer.deleted',
        targetType: 'closer',
        targetId: data.pkEmail,
      });
      return { ok: true };
    } catch (err) {
      logServerError('deleteCloser', { pkEmail: data.pkEmail }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

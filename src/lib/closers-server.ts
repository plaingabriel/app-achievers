import { db } from '@/db/index';
import { closers } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { env } from './env';
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

// Look up a Notion user by email via the Express server
// (`GET /notion/user-by-email`, see CLAUDE.md → SERVER_URL). Lets the closer
// form auto-fill `idNotion` from the closer's email instead of pasting it by
// hand. Permission-gated like the writes it feeds.
export type NotionUserLookup =
  | { ok: true; idNotion: string; name: string | null; avatarUrl: string | null }
  | { ok: false; error: string };

export const lookupNotionUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }): Promise<NotionUserLookup> => {
    const email = data.email.trim().toLowerCase();
    if (!email) return { ok: false, error: es.closers.notionLookup.emailRequired };
    try {
      await assertPermission('closers:write');

      const url = `${env.SERVER_URL}/notion/user-by-email?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      if (!res.ok) return { ok: false, error: es.closers.notionLookup.serverError };

      const body = (await res.json()) as
        | { id: string; name: string | null; email: string; avatarUrl: string | null }
        | { success: false; message: string };

      // Server signals "not found" with `{ success: false }`; a hit has an `id`.
      if ('success' in body && body.success === false) {
        return { ok: false, error: es.closers.notionLookup.notFound };
      }
      if (!('id' in body) || !body.id) {
        return { ok: false, error: es.closers.notionLookup.serverError };
      }
      return { ok: true, idNotion: body.id, name: body.name, avatarUrl: body.avatarUrl };
    } catch (err) {
      logServerError('lookupNotionUser', { email }, err);
      return { ok: false, error: es.closers.notionLookup.serverError };
    }
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

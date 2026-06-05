import { db } from '@/db/index';
import { personas } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { assertPermission, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Data CRUD for the schema-frozen `Personas` table (plan §4.1 / phase 08).
// "Frozen" = no structure migrations; row CRUD here is expected. Every export
// is a createServerFn, so the bundler strips the db layer from the client.
// Reads need personas:read, writes personas:write, deletes personas:delete —
// the seeded matrix grants delete to admin only, gating it for non-admins.
// Personas.id is an opaque natural key (UUID or short email), supplied on create
// and immutable afterwards.

export const fetchPersonasData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertPermission('personas:read');
  const rows = await db
    .select({ id: personas.id, name: personas.name })
    .from(personas)
    .orderBy(personas.name);
  return { personas: rows };
});

export const createPersona = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; name: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('personas:write');
      const id = data.id.trim();
      const name = data.name.trim();
      if (!id) return { ok: false, error: es.personas.idRequired };
      if (!name) return { ok: false, error: es.personas.nameRequired };

      const [existing] = await db
        .select({ id: personas.id })
        .from(personas)
        .where(eq(personas.id, id))
        .limit(1);
      if (existing) return { ok: false, error: es.data.duplicateKey };

      await db.insert(personas).values({ id, name });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'persona.created',
        targetType: 'persona',
        targetId: id,
        metadata: { name },
      });
      return { ok: true };
    } catch (err) {
      logServerError('createPersona', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const updatePersona = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string; name: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('personas:write');
      const name = data.name.trim();
      if (!name) return { ok: false, error: es.personas.nameRequired };

      const [existing] = await db
        .select({ id: personas.id })
        .from(personas)
        .where(eq(personas.id, data.id))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.update(personas).set({ name }).where(eq(personas.id, data.id));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'persona.updated',
        targetType: 'persona',
        targetId: data.id,
        metadata: { name },
      });
      return { ok: true };
    } catch (err) {
      logServerError('updatePersona', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const deletePersona = createServerFn({ method: 'POST' })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('personas:delete');

      const [existing] = await db
        .select({ id: personas.id, name: personas.name })
        .from(personas)
        .where(eq(personas.id, data.id))
        .limit(1);
      if (!existing) return { ok: false, error: es.data.notFound };

      await db.delete(personas).where(eq(personas.id, data.id));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'persona.deleted',
        targetType: 'persona',
        targetId: data.id,
        metadata: { name: existing.name },
      });
      return { ok: true };
    } catch (err) {
      logServerError('deletePersona', { id: data.id }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

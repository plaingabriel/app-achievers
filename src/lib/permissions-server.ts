import { db } from '@/db/index';
import { project, user, userPermission, userProjectAccess } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { eq, inArray } from 'drizzle-orm';
import { AUDIT } from './audit';
import { isMissingTableError } from './db-errors';
import { areGrantable } from './permissions';
import { assertAdmin, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Per-user access admin (ADR 0014). Admin-only: every mutation re-checks the
// caller is an admin server-side via assertAdmin (never trusts the client) and
// records the matching §4.5 audit event. Admins implicitly hold everything; for
// everyone else, access is the explicit `user_permission` grant list over the
// data tables. This module imports the DB layer, so every export is a
// createServerFn — the bundler strips it (and its db import) from the client.

// Everything the permissions screen renders: all users with their admin flag and
// their granted `resource:action` strings. Admin-only.
export const fetchPermissionsData = createServerFn({ method: 'GET' }).handler(async () => {
  const { session: caller } = await assertAdmin();

  const [users, grants, projects, projectAccess] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin })
      .from(user),
    db
      .select({
        userId: userPermission.userId,
        resource: userPermission.resource,
        action: userPermission.action,
      })
      .from(userPermission),
    db.select({ id: project.id, nombre: project.nombre }).from(project),
    db
      .select({ userId: userProjectAccess.userId, projectId: userProjectAccess.projectId })
      .from(userProjectAccess)
      .catch((err) => {
        if (isMissingTableError(err, 'user_project_access')) return [];
        throw err;
      }),
  ]);

  const permsByUser = new Map<string, string[]>();
  for (const g of grants) {
    const list = permsByUser.get(g.userId) ?? [];
    list.push(`${g.resource}:${g.action}`);
    permsByUser.set(g.userId, list);
  }

  const projectIdsByUser = new Map<string, number[]>();
  for (const entry of projectAccess) {
    const list = projectIdsByUser.get(entry.userId) ?? [];
    list.push(entry.projectId);
    projectIdsByUser.set(entry.userId, list);
  }

  return {
    users: users.map((u) => ({
      ...u,
      permissions: permsByUser.get(u.id) ?? [],
      projectIds: projectIdsByUser.get(u.id) ?? [],
    })),
    projects: projects.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    currentUserId: caller.user.id,
  };
});

// Replace a user's grant set wholesale. Admins have everything implicitly, so
// editing their grant list is a no-op — toggle the admin flag via setUserAdmin
// instead. Rejects any permission outside the grantable catalog.
export const setUserPermissions = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; permissions: string[] }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertAdmin();

      const [target] = await db
        .select({ id: user.id, email: user.email, isAdmin: user.isAdmin })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.permissions.userNotFound };
      if (target.isAdmin) return { ok: false, error: es.permissions.adminImmutable };
      if (!areGrantable(data.permissions))
        return { ok: false, error: es.permissions.invalidPermissions };

      await db.transaction(async (tx) => {
        await tx.delete(userPermission).where(eq(userPermission.userId, data.userId));
        if (data.permissions.length > 0) {
          await tx.insert(userPermission).values(
            data.permissions.map((p) => {
              const [resource, action] = p.split(':') as [string, string];
              return { userId: data.userId, resource, action, grantedBy: session.user.id };
            }),
          );
        }
      });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: AUDIT.permissionsChanged,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email, permissionCount: data.permissions.length },
      });

      return { ok: true };
    } catch (err) {
      logServerError('setUserPermissions', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// Promote/demote a user to/from admin. Lockout guard: you can't demote the last
// admin — that's what keeps an admin from locking everyone (incl. themselves)
// out. Promoting clears any now-redundant per-table grants.
export const setUserAdmin = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; isAdmin: boolean }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertAdmin();

      const [target] = await db
        .select({ id: user.id, email: user.email, isAdmin: user.isAdmin })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.permissions.userNotFound };
      if (target.isAdmin === data.isAdmin) return { ok: true };

      if (!data.isAdmin) {
        const admins = await db.select({ id: user.id }).from(user).where(eq(user.isAdmin, true));
        if (admins.length <= 1) return { ok: false, error: es.permissions.lastAdmin };
      }

      await db.transaction(async (tx) => {
        await tx.update(user).set({ isAdmin: data.isAdmin }).where(eq(user.id, data.userId));
        // An admin's per-table grants are redundant; clear them so a later demote
        // starts from a clean slate.
        if (data.isAdmin) {
          await tx.delete(userPermission).where(eq(userPermission.userId, data.userId));
          await tx.delete(userProjectAccess).where(eq(userProjectAccess.userId, data.userId));
        }
      });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: data.isAdmin ? AUDIT.adminGranted : AUDIT.adminRevoked,
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email },
      });

      return { ok: true };
    } catch (err) {
      logServerError('setUserAdmin', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

export const setUserProjectAccess = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; projectIds: number[] }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertAdmin();

      const [target] = await db
        .select({ id: user.id, email: user.email, isAdmin: user.isAdmin })
        .from(user)
        .where(eq(user.id, data.userId))
        .limit(1);
      if (!target) return { ok: false, error: es.permissions.userNotFound };
      if (target.isAdmin) return { ok: false, error: es.permissions.adminImmutable };

      const uniqueProjectIds = [...new Set(data.projectIds)].sort((a, b) => a - b);
      const existingProjects = uniqueProjectIds.length
        ? await db
            .select({ id: project.id })
            .from(project)
            .where(inArray(project.id, uniqueProjectIds))
        : [];
      if (existingProjects.length !== uniqueProjectIds.length) {
        return { ok: false, error: es.permissions.invalidProjects };
      }

      await db.transaction(async (tx) => {
        await tx.delete(userProjectAccess).where(eq(userProjectAccess.userId, data.userId));
        if (uniqueProjectIds.length > 0) {
          await tx.insert(userProjectAccess).values(
            uniqueProjectIds.map((projectId) => ({
              userId: data.userId,
              projectId,
              grantedBy: session.user.id,
            })),
          );
        }
      });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'permissions.projects_changed',
        targetType: 'user',
        targetId: data.userId,
        metadata: { email: target.email, projectCount: uniqueProjectIds.length },
      });

      return { ok: true };
    } catch (err) {
      if (isMissingTableError(err, 'user_project_access')) {
        return {
          ok: false,
          error: 'La tabla de accesos por proyecto no existe todavia. Ejecuta la migracion pendiente.',
        };
      }
      logServerError('setUserProjectAccess', { userId: data.userId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

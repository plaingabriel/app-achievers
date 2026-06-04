import { db } from '@/db/index';
import { permission, role, rolePermission, user, userRole } from '@/db/schema/index';
import { es } from '@/i18n/es';
import { createServerFn } from '@tanstack/react-start';
import { and, eq, inArray } from 'drizzle-orm';
import { assertPermission, logServerError, recordAudit } from './server-rbac';
import type { MutationResult } from './server-rbac';

// Server-side RBAC admin (plan §4.4 batch 3). Every mutation re-checks the
// caller's permission server-side via assertPermission (never trusts the client)
// and records the matching §4.5 audit event. `roles:delete` is admin-only by the
// seeded matrix, so editors can read/assign but not destroy.
//
// This module imports the DB layer, so it must contain ONLY server functions
// (every export is a createServerFn) — the bundler strips the whole module, its
// db import, and the server-rbac helpers out of the client bundle.

// Everything the roles screen renders: roles + their permissions, the full
// permission catalog, and users with their assigned roles. Requires roles:read.
export const fetchRolesData = createServerFn({ method: 'GET' }).handler(async () => {
  await assertPermission('roles:read');

  const [roles, permissions, rolePerms, users, userRoles] = await Promise.all([
    db
      .select({
        id: role.id,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      })
      .from(role),
    db
      .select({ id: permission.id, resource: permission.resource, action: permission.action })
      .from(permission),
    db
      .select({ roleId: rolePermission.roleId, permissionId: rolePermission.permissionId })
      .from(rolePermission),
    db.select({ id: user.id, name: user.name, email: user.email }).from(user),
    db.select({ userId: userRole.userId, roleId: userRole.roleId }).from(userRole),
  ]);

  const permsByRole = new Map<string, string[]>();
  for (const rp of rolePerms) {
    const list = permsByRole.get(rp.roleId) ?? [];
    list.push(rp.permissionId);
    permsByRole.set(rp.roleId, list);
  }
  const rolesByUser = new Map<string, string[]>();
  for (const ur of userRoles) {
    const list = rolesByUser.get(ur.userId) ?? [];
    list.push(ur.roleId);
    rolesByUser.set(ur.userId, list);
  }

  return {
    roles: roles.map((r) => ({ ...r, permissionIds: permsByRole.get(r.id) ?? [] })),
    permissions,
    users: users.map((u) => ({ ...u, roleIds: rolesByUser.get(u.id) ?? [] })),
  };
});

// Replace a role's permission set wholesale. System roles (admin) are immutable
// to prevent locking every admin out of the dashboard.
export const setRolePermissions = createServerFn({ method: 'POST' })
  .inputValidator((data: { roleId: string; permissionIds: string[] }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('roles:write');

      const [target] = await db.select().from(role).where(eq(role.id, data.roleId)).limit(1);
      if (!target) return { ok: false, error: es.roles.notFound };
      if (target.isSystem) return { ok: false, error: es.roles.systemImmutable };

      // Only persist permission ids that actually exist (guards against stale UI).
      const valid =
        data.permissionIds.length === 0
          ? []
          : await db
              .select({ id: permission.id })
              .from(permission)
              .where(inArray(permission.id, data.permissionIds));
      const validIds = valid.map((p) => p.id);

      await db.transaction(async (tx) => {
        await tx.delete(rolePermission).where(eq(rolePermission.roleId, data.roleId));
        if (validIds.length > 0) {
          await tx
            .insert(rolePermission)
            .values(validIds.map((permissionId) => ({ roleId: data.roleId, permissionId })));
        }
      });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'role.permissions_changed',
        targetType: 'role',
        targetId: data.roleId,
        metadata: { name: target.name, permissionCount: validIds.length },
      });

      return { ok: true };
    } catch (err) {
      logServerError('setRolePermissions', { roleId: data.roleId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// Grant a role to a user (idempotent — re-granting is a no-op).
export const assignRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; roleId: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('roles:write');

      const existing = await db
        .select({ userId: userRole.userId })
        .from(userRole)
        .where(and(eq(userRole.userId, data.userId), eq(userRole.roleId, data.roleId)))
        .limit(1);
      if (existing.length > 0) return { ok: true };

      await db
        .insert(userRole)
        .values({ userId: data.userId, roleId: data.roleId, grantedBy: session.user.id });

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'role.granted',
        targetType: 'user',
        targetId: data.userId,
        metadata: { roleId: data.roleId },
      });

      return { ok: true };
    } catch (err) {
      logServerError('assignRole', { userId: data.userId, roleId: data.roleId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

// Revoke a role from a user. Lockout guard: you can't remove the last holder of a
// system role (admin) — that's what keeps an admin from locking everyone (incl.
// themselves) out. Dropping your own non-system role is allowed.
export const revokeRole = createServerFn({ method: 'POST' })
  .inputValidator((data: { userId: string; roleId: string }) => data)
  .handler(async ({ data }): Promise<MutationResult> => {
    try {
      const { session, headers } = await assertPermission('roles:write');

      const [target] = await db.select().from(role).where(eq(role.id, data.roleId)).limit(1);
      if (!target) return { ok: false, error: es.roles.notFound };
      if (target.isSystem) {
        const holders = await db
          .select({ userId: userRole.userId })
          .from(userRole)
          .where(eq(userRole.roleId, data.roleId));
        if (holders.length <= 1) return { ok: false, error: es.roles.lastAdmin };
      }

      await db
        .delete(userRole)
        .where(and(eq(userRole.userId, data.userId), eq(userRole.roleId, data.roleId)));

      await recordAudit({
        actorId: session.user.id,
        actorEmail: session.user.email,
        headers,
        action: 'role.revoked',
        targetType: 'user',
        targetId: data.userId,
        metadata: { roleId: data.roleId },
      });

      return { ok: true };
    } catch (err) {
      logServerError('revokeRole', { userId: data.userId, roleId: data.roleId }, err);
      return { ok: false, error: es.errors.generic };
    }
  });

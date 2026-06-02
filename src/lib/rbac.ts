import { db } from '@/db/index';
import { permission, rolePermission, userRole } from '@/db/schema/index';
// RBAC resolution (plan §4.4). Page/feature visibility, multi-role per user.
import { eq, inArray } from 'drizzle-orm';
import type { Permission } from './permissions';

// Re-export the pure primitives so existing server-side importers (scripts/seed)
// keep working while the client imports them from `permissions.ts` directly.
export { ACTIONS, RESOURCES, can, hasPermission } from './permissions';
export type { Action, Permission, Resource } from './permissions';

// Resolve the flattened permission set for a user across all their roles.
// Resolved fresh per request (not baked into the session token), so a role's
// permission change takes effect on the user's next request (plan §4.4).
export async function getUserPermissions(userId: string): Promise<Set<Permission>> {
  const roles = await db
    .select({ roleId: userRole.roleId })
    .from(userRole)
    .where(eq(userRole.userId, userId));
  if (roles.length === 0) return new Set();
  const roleIds = roles.map((r) => r.roleId);

  const rows = await db
    .select({ resource: permission.resource, action: permission.action })
    .from(rolePermission)
    .innerJoin(permission, eq(rolePermission.permissionId, permission.id))
    .where(inArray(rolePermission.roleId, roleIds));

  return new Set(rows.map((r) => `${r.resource}:${r.action}` as Permission));
}

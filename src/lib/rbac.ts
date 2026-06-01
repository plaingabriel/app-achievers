import { db } from '@/db/index';
import { permission, rolePermission, userRole } from '@/db/schema/index';
// RBAC resolution (plan §4.4). Page/feature visibility, multi-role per user.
import { eq, inArray } from 'drizzle-orm';

export type Permission = `${string}:${string}`; // e.g. "members:read"

// Resolve the flattened permission set for a user across all their roles.
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

export function can(perms: Set<Permission>, required: Permission): boolean {
  return perms.has(required);
}

// Seeded permission matrix (plan §4.4). Used by scripts/seed.ts.
export const RESOURCES = [
  'members',
  'roles',
  'invitations',
  'personas',
  'closers',
  'calendarios',
  'logs',
  'audit',
] as const;
export const ACTIONS = ['read', 'write', 'delete'] as const;

import { db } from '@/db/index';
import { user, userPermission, userProjectAccess } from '@/db/schema/index';
// Access resolution (ADR 0014). Admin = superuser flag on `user`; everyone else
// holds an explicit list of per-table grants in `user_permission`.
import { eq } from 'drizzle-orm';
import { GRANTABLE_PERMISSIONS } from './permissions';
import type { Permission } from './permissions';

// Re-export the pure primitives so existing server-side importers (scripts/seed)
// keep working while the client imports them from `permissions.ts` directly.
export {
  ACTIONS,
  GRANTABLE_PERMISSIONS,
  GRANTABLE_RESOURCES,
  areGrantable,
  can,
  hasPermission,
} from './permissions';
export type { Action, Permission, Resource } from './permissions';

export type Access = {
  isAdmin: boolean;
  permissions: Set<Permission>;
  projectIds: Set<number> | null;
};

// Resolve a user's access fresh per request (not baked into the session token),
// so a grant change takes effect on the user's next request. Admins implicitly
// hold every grantable permission (so page-level `permissions.includes(...)`
// checks light up their controls) on top of `isAdmin`, which is what unlocks the
// admin-only screens.
export async function resolveAccess(userId: string): Promise<Access> {
  const [row] = await db
    .select({ isAdmin: user.isAdmin })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row) return { isAdmin: false, permissions: new Set(), projectIds: new Set() };
  if (row.isAdmin) {
    return { isAdmin: true, permissions: new Set(GRANTABLE_PERMISSIONS), projectIds: null };
  }

  const [grants, projects] = await Promise.all([
    db
      .select({ resource: userPermission.resource, action: userPermission.action })
      .from(userPermission)
      .where(eq(userPermission.userId, userId)),
    db
      .select({ projectId: userProjectAccess.projectId })
      .from(userProjectAccess)
      .where(eq(userProjectAccess.userId, userId)),
  ]);

  return {
    isAdmin: false,
    permissions: new Set(grants.map((g) => `${g.resource}:${g.action}` as Permission)),
    projectIds: new Set(projects.map((p) => p.projectId)),
  };
}

export function canAccessProject(access: Access, projectId: number): boolean {
  return access.isAdmin || access.projectIds?.has(projectId) === true;
}

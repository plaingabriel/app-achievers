// Authorization primitives — pure and client-safe (no DB / request imports), so
// route guards, the sidebar, and the permissions screen can all share them
// (ADR 0014). The DB-backed resolver lives in `rbac.ts`; never import that from
// the client.

export type Permission = `${string}:${string}`; // e.g. "personas:read"

// Grantable resources: the data tables an editor can be given access to. The
// management areas (members, permissions, invitations, logs, audit) are NOT
// grantable — they are reachable by admins only (resolved via `user.is_admin`).
export const GRANTABLE_RESOURCES = ['personas', 'closers', 'calendarios', 'projects'] as const;
export const ACTIONS = ['read', 'write', 'delete'] as const;

export type Resource = (typeof GRANTABLE_RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

// Every grant an admin can hand out: resource × action.
export const GRANTABLE_PERMISSIONS: Permission[] = GRANTABLE_RESOURCES.flatMap((r) =>
  ACTIONS.map((a) => `${r}:${a}` as Permission),
);

const GRANTABLE_SET = new Set<string>(GRANTABLE_PERMISSIONS);

// True if every permission in the list is a real, grantable one. Guards against
// stale/forged grant lists from the client (permissions screen, invitations).
export function areGrantable(perms: readonly string[]): perms is Permission[] {
  return perms.every((p) => GRANTABLE_SET.has(p));
}

// Set-based check (server, where resolveAccess returns a Set).
export function can(perms: Set<Permission>, required: Permission): boolean {
  return perms.has(required);
}

// Array-based check (client/router context, where permissions are serialized).
export function hasPermission(perms: readonly string[], required: Permission): boolean {
  return perms.includes(required);
}

// RBAC primitives — pure and client-safe (no DB / request imports), so route
// guards, the sidebar, and the roles screen can all share them (plan §4.4).
// The DB-backed resolver lives in `rbac.ts`; never import that from the client.

export type Permission = `${string}:${string}`; // e.g. "members:read"

// Resources × actions seeded by scripts/seed.ts. `audit:read_all` is a special
// admin-wide permission seeded on top of the cross-product (plan §4.4).
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

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

// Set-based check (server, where getUserPermissions returns a Set).
export function can(perms: Set<Permission>, required: Permission): boolean {
  return perms.has(required);
}

// Array-based check (client/router context, where permissions are serialized).
export function hasPermission(perms: readonly string[], required: Permission): boolean {
  return perms.includes(required);
}

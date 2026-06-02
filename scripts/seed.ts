/**
 * First-admin bootstrap (plan §8). Run once: `pnpm db:seed`.
 * 1. Seeds admin/editor/viewer roles + the default permission matrix (§4.4).
 * 2. Creates one admin user (email = ADMIN_EMAIL) with a random 32-char
 *    password printed ONCE to stdout, must_change_password = true.
 * 3. Grants the admin role and writes an audit_log entry.
 * Refuses to run if any `user` row already exists.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/db/index';
import { auditLog, permission, role, rolePermission, user, userRole } from '@/db/schema/index';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { ACTIONS, RESOURCES } from '@/lib/rbac';
import { eq } from 'drizzle-orm';

async function main() {
  if (!env.ADMIN_EMAIL) throw new Error('Set ADMIN_EMAIL in .env before seeding.');

  const existing = await db.select({ id: user.id }).from(user).limit(1);
  if (existing.length > 0) {
    console.error('Refusing to seed: a user already exists.');
    process.exit(1);
  }

  // No admin user yet => the system isn't bootstrapped. Reset the seed-owned
  // RBAC tables so a re-run after a partially failed seed starts clean (these
  // are dashboard-owned, never the frozen existing tables). Order respects FKs.
  await db.delete(rolePermission);
  await db.delete(userRole);
  await db.delete(permission);
  await db.delete(role);

  // Roles
  const roles = {
    admin: randomUUID(),
    editor: randomUUID(),
    viewer: randomUUID(),
  };
  await db.insert(role).values([
    { id: roles.admin, name: 'admin', isSystem: true, description: 'Acceso total' },
    { id: roles.editor, name: 'editor', description: 'Lectura + escritura de datos' },
    { id: roles.viewer, name: 'viewer', description: 'Solo lectura' },
  ]);

  // Permissions: resource × action, pruned. Plus audit:read_all for admins.
  const perms: { id: string; resource: string; action: string }[] = [];
  for (const r of RESOURCES)
    for (const a of ACTIONS) perms.push({ id: randomUUID(), resource: r, action: a });
  perms.push({ id: randomUUID(), resource: 'audit', action: 'read_all' });
  await db.insert(permission).values(perms);

  const grant = (roleId: string, pick: (p: (typeof perms)[number]) => boolean) =>
    db
      .insert(rolePermission)
      .values(perms.filter(pick).map((p) => ({ roleId, permissionId: p.id })));

  // Per plan §4.4. "Data resources" are the production tables exposed for full
  // CRUD; admin-only resources (members, roles, invitations, logs) are NOT
  // granted to editor/viewer, so they can't reach those admin pages.
  const DATA_RESOURCES = new Set(['personas', 'closers', 'calendarios']);

  // admin: everything.
  await grant(roles.admin, () => true);
  // editor: read + write on data resources, read on logs, read on own audit.
  await grant(
    roles.editor,
    (p) =>
      (DATA_RESOURCES.has(p.resource) && (p.action === 'read' || p.action === 'write')) ||
      (p.resource === 'logs' && p.action === 'read') ||
      (p.resource === 'audit' && p.action === 'read'),
  );
  // viewer: read on data resources, read on own audit.
  await grant(
    roles.viewer,
    (p) =>
      (DATA_RESOURCES.has(p.resource) && p.action === 'read') ||
      (p.resource === 'audit' && p.action === 'read'),
  );

  // Admin user with one-time random password. Public signup is disabled
  // (auth.ts: disableSignUp), and Better Auth's signUpEmail honors that even
  // server-side — so bootstrap via the internal adapter, mirroring the sign-up
  // route: hash password -> createUser -> linkAccount('credential').
  const password = randomBytes(24).toString('base64url').slice(0, 32);
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const createdUser = await ctx.internalAdapter.createUser({
    email: env.ADMIN_EMAIL,
    name: 'Admin',
    emailVerified: false,
  });
  if (!createdUser) throw new Error('Failed to create admin user.');
  await ctx.internalAdapter.linkAccount({
    userId: createdUser.id,
    providerId: 'credential',
    accountId: createdUser.id,
    password: hash,
  });
  const userId = createdUser.id;

  await db.update(user).set({ mustChangePassword: true }).where(eq(user.id, userId));
  await db.insert(userRole).values({ userId, roleId: roles.admin });
  await db.insert(auditLog).values({
    id: randomUUID(),
    userId,
    actorEmail: env.ADMIN_EMAIL,
    action: 'user.seeded',
    targetType: 'user',
    targetId: userId,
  });

  console.log('\n=== FIRST ADMIN CREATED ===');
  console.log('email   :', env.ADMIN_EMAIL);
  console.log('password:', password, '  (shown once — change it on first login)');
  console.log('===========================\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

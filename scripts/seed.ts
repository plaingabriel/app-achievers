/**
 * First-admin bootstrap (plan §8, ADR 0014). Run once: `pnpm db:seed`.
 * 1. Creates one admin user (email = ADMIN_EMAIL) with a random 32-char
 *    password printed ONCE to stdout, must_change_password = true and
 *    is_admin = true (superuser — implicitly holds every permission).
 * 2. Writes an audit_log entry.
 * Refuses to run if any `user` row already exists.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { db } from '@/db/index';
import { auditLog, user } from '@/db/schema/index';
import { auth } from '@/lib/auth';
import { env } from '@/lib/env';
import { eq } from 'drizzle-orm';

async function main() {
  if (!env.ADMIN_EMAIL) throw new Error('Set ADMIN_EMAIL in .env before seeding.');

  const existing = await db.select({ id: user.id }).from(user).limit(1);
  if (existing.length > 0) {
    console.error('Refusing to seed: a user already exists.');
    process.exit(1);
  }

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

  await db.update(user).set({ mustChangePassword: true, isAdmin: true }).where(eq(user.id, userId));
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

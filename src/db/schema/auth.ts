// Better Auth tables (plan §4.4). Better Auth manages user/session/account/
// verification + the twoFactor plugin table. We declare them in Drizzle so the
// dashboard owns the migrations. Reconcile exact columns with:
//   npx @better-auth/cli generate
// We add a few app columns: persona_id (soft link, plan §4.2), status,
// must_change_password (first-admin bootstrap, plan §8).
import { boolean, char, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: varchar('image', { length: 512 }),
  // App extensions:
  personaId: varchar('persona_id', { length: 255 }), // soft link → Personas.id (no FK)
  status: varchar('status', { length: 32 }).notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  twoFactorEnabled: boolean('two_factor_enabled').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = mysqlTable('session', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  token: varchar('token', { length: 255 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: varchar('user_agent', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const account = mysqlTable('account', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  accountId: varchar('account_id', { length: 255 }).notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const verification = mysqlTable('verification', {
  id: varchar('id', { length: 36 }).primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(),
  value: varchar('value', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// twoFactor plugin storage (TOTP secret + backup codes).
export const twoFactor = mysqlTable('two_factor', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 36 }).notNull(),
  secret: text('secret').notNull(),
  backupCodes: text('backup_codes').notNull(),
});

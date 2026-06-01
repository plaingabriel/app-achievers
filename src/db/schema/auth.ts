// Better Auth tables (plan §4.4). Better Auth manages user/session/account/
// verification + the twoFactor plugin table. We declare them in Drizzle so the
// dashboard owns the migrations.
//
// The Better-Auth-managed columns below mirror `npx @better-auth/cli generate`
// exactly (better-auth ^1.4, twoFactor plugin) — including updated_at, the
// account OAuth token columns, the userId indexes/FKs, and timestamp fsp:3.
// On top of that we add a few app columns to `user`: persona_id (soft link,
// plan §4.2), status, and must_change_password (first-admin bootstrap, §8).
import { boolean, index, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const user = mysqlTable('user', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { fsp: 3 })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
  twoFactorEnabled: boolean('two_factor_enabled').default(false),
  // App extensions (not managed by Better Auth):
  personaId: varchar('persona_id', { length: 255 }), // soft link → Personas.id (no FK)
  status: varchar('status', { length: 32 }).notNull().default('active'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
});

export const session = mysqlTable(
  'session',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    token: varchar('token', { length: 255 }).notNull().unique(),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = mysqlTable(
  'account',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { fsp: 3 }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { fsp: 3 }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = mysqlTable(
  'verification',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    identifier: varchar('identifier', { length: 255 }).notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { fsp: 3 }).notNull(),
    createdAt: timestamp('created_at', { fsp: 3 }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { fsp: 3 })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

// twoFactor plugin storage (TOTP secret + backup codes).
export const twoFactor = mysqlTable(
  'two_factor',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    secret: varchar('secret', { length: 255 }).notNull(),
    backupCodes: text('backup_codes').notNull(),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    verified: boolean('verified').default(true),
  },
  (t) => [index('two_factor_user_id_idx').on(t.userId)],
);

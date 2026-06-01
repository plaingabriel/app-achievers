// App tables: invitation (plan §4.4), audit_log (§4.5), error_log (§4.6).
import { bigint, index, json, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const invitation = mysqlTable(
  'invitation',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    roleId: varchar('role_id', { length: 36 }).notNull(),
    invitedBy: varchar('invited_by', { length: 36 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({ emailIdx: index('invitation_email_idx').on(t.email) }),
);

// Append-only. No update/delete from the app, even by admins (plan §4.5).
export const auditLog = mysqlTable(
  'audit_log',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }),
    actorEmail: varchar('actor_email', { length: 255 }),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 64 }),
    targetId: varchar('target_id', { length: 255 }),
    metadata: json('metadata'),
    ip: varchar('ip', { length: 45 }),
    userAgent: varchar('user_agent', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('audit_user_idx').on(t.userId, t.createdAt),
    actionIdx: index('audit_action_idx').on(t.action, t.createdAt),
  }),
);

// Written by the dashboard (emitter='dashboard') AND the existing Express
// server (emitter='express-server'). 7-day retention via node-cron (§4.6).
export const errorLog = mysqlTable(
  'error_log',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    level: varchar('level', { length: 16 }).notNull(),
    message: text('message').notNull(),
    stack: text('stack'),
    source: varchar('source', { length: 128 }),
    requestId: varchar('request_id', { length: 64 }),
    metadata: json('metadata'),
    emitter: varchar('emitter', { length: 32 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    createdIdx: index('errlog_created_idx').on(t.createdAt),
    levelIdx: index('errlog_level_idx').on(t.level, t.createdAt),
    emitterIdx: index('errlog_emitter_idx').on(t.emitter, t.createdAt),
  }),
);

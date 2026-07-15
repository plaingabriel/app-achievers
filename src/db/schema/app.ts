// App tables: invitation (plan §4.4), audit_log (§4.5), error_log (§4.6).
import {
  bigint,
  boolean,
  double,
  index,
  json,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/mysql-core';
import { user } from './auth';

// Invite-only onboarding (ADR 0014). The invite carries the access the invitee
// will get on accept: either `is_admin` (superuser) or a list of grantable
// `resource:action` strings stored in `permissions`.
export const invitation = mysqlTable(
  'invitation',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    email: varchar('email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
    isAdmin: boolean('is_admin').notNull().default(false),
    permissions: json('permissions').notNull(), // string[] of "resource:action"
    invitedBy: varchar('invited_by', { length: 36 })
      .notNull()
      .references(() => user.id),
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
    // ON DELETE SET NULL: the audit row survives user deletion; actor_email
    // preserves who acted (plan §4.5).
    userId: varchar('user_id', { length: 36 }).references(() => user.id, { onDelete: 'set null' }),
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

export const project = mysqlTable('proyecto', {
  id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
  nombre: varchar('nombre', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const registro = mysqlTable(
  'registros',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    proyectoId: bigint('proyecto_id', { mode: 'number' })
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    nombre: varchar('nombre', { length: 255 }).notNull(),
    correo: varchar('correo', { length: 255 }).notNull(),
    telefono: varchar('telefono', { length: 32 }),
    metadata: json('metadata').notNull(),
    origen: varchar('origen', { length: 128 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    proyectoIdx: index('registros_proyecto_id_idx').on(t.proyectoId),
    correoIdx: index('registros_correo_idx').on(t.correo),
  }),
);

export const encuesta = mysqlTable(
  'encuestas',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    proyectoId: bigint('proyecto_id', { mode: 'number' })
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    contactId: varchar('contact_id', { length: 255 }).notNull(),
    respuestas: json('respuestas').notNull(),
    score: double('score'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    proyectoIdx: index('encuestas_proyecto_id_idx').on(t.proyectoId),
    contactIdx: index('encuestas_contact_id_idx').on(t.contactId),
    scoreIdx: index('encuestas_score_idx').on(t.score),
  }),
);

export const grupo = mysqlTable(
  'grupos',
  {
    id: bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
    proyectoId: bigint('proyecto_id', { mode: 'number' })
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    telefono: varchar('telefono', { length: 32 }).notNull(),
    campana: varchar('campana', { length: 255 }).notNull(),
    grupo: varchar('grupo', { length: 255 }).notNull(),
    fecha: timestamp('fecha').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    proyectoIdx: index('grupos_proyecto_id_idx').on(t.proyectoId),
    telefonoIdx: index('grupos_telefono_idx').on(t.telefono),
    fechaIdx: index('grupos_fecha_idx').on(t.fecha),
  }),
);

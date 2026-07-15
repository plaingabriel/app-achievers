// Per-user access grants (ADR 0014 — ABAC). Replaces the old role/permission/
// role_permission/user_role tables: authorization is now a superuser flag
// (`user.is_admin`) plus, for everyone else, an explicit list of
// `resource:action` grants over the data tables (personas/closers/calendarios).
// Resolved fresh per request by `resolveAccess` in src/lib/rbac.ts.
import { bigint, mysqlTable, primaryKey, timestamp, varchar } from 'drizzle-orm/mysql-core';
import { project } from './app';
import { user } from './auth';

export const userPermission = mysqlTable(
  'user_permission',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    resource: varchar('resource', { length: 64 }).notNull(), // personas, closers, calendarios
    action: varchar('action', { length: 32 }).notNull(), // read, write, delete
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
    grantedBy: varchar('granted_by', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.resource, t.action] }) }),
);

export const userProjectAccess = mysqlTable(
  'user_project_access',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    projectId: bigint('project_id', { mode: 'number' })
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
    grantedBy: varchar('granted_by', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.projectId] }) }),
);

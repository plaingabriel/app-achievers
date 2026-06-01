// RBAC — Shape B, multi-role per user (plan §4.4). Page/feature visibility.
// Foreign keys mirror the plan's §4.4 cascade rules.
import {
  boolean,
  mysqlTable,
  primaryKey,
  timestamp,
  unique,
  varchar,
} from 'drizzle-orm/mysql-core';
import { user } from './auth';

export const role = mysqlTable('role', {
  id: varchar('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const permission = mysqlTable(
  'permission',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    resource: varchar('resource', { length: 64 }).notNull(), // members, logs, personas…
    action: varchar('action', { length: 32 }).notNull(), // read, write, delete, read_all
    description: varchar('description', { length: 255 }),
  },
  (t) => ({ resourceAction: unique().on(t.resource, t.action) }),
);

export const rolePermission = mysqlTable(
  'role_permission',
  {
    roleId: varchar('role_id', { length: 36 })
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
    permissionId: varchar('permission_id', { length: 36 })
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.roleId, t.permissionId] }) }),
);

export const userRole = mysqlTable(
  'user_role',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: varchar('role_id', { length: 36 })
      .notNull()
      .references(() => role.id, { onDelete: 'restrict' }),
    grantedAt: timestamp('granted_at').notNull().defaultNow(),
    grantedBy: varchar('granted_by', { length: 36 }).references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.roleId] }) }),
);

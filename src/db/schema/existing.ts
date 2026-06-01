// EXISTING TABLES — schema-frozen, full-CRUD (plan §4.1 / §4.7).
// These already exist in `Evergreen`. Declared here for typed data access.
// They are EXCLUDED from migrations via drizzle.config.ts `tablesFilter`.
// MySQL tinyint(1) maps to Drizzle boolean(); `activo` defaults to 1/true.
// Table + column names stay Spanish to match the live DB (plan §5).
import { boolean, char, mysqlTable, varchar } from 'drizzle-orm/mysql-core';

export const calendarios = mysqlTable('Calendarios', {
  pkNombre: varchar('pk_nombre', { length: 255 }).primaryKey(),
  formId: varchar('form_id', { length: 255 }),
  landingId: varchar('landing_id', { length: 255 }),
  funnel: varchar('funnel', { length: 255 }),
  setter: boolean('setter'),
  activo: boolean('activo').default(true),
});

export const closers = mysqlTable('Closers', {
  nombre: varchar('nombre', { length: 255 }),
  apellido: varchar('apellido', { length: 255 }),
  tagNotion: varchar('tag_notion', { length: 255 }),
  pkEmail: varchar('pk_email', { length: 255 }).primaryKey(),
  idNotion: varchar('id_notion', { length: 255 }),
  formId: varchar('form_id', { length: 255 }),
  landingId: varchar('landing_id', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 255 }),
  funnel: varchar('funnel', { length: 255 }),
  calendlyUser: varchar('calendly_user', { length: 255 }),
  activo: boolean('activo').default(true),
});

// NOTE: Personas.id legitimately mixes UUIDs and short emails
// (e.g. "fothyb@gmail.com"), so it is treated as an opaque char(36) (plan §4.2).
export const personas = mysqlTable('Personas', {
  id: char('id', { length: 36 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
});

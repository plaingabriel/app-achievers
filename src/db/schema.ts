/**
 * Drizzle schema — built in PHASE 2 (docs/phases/phase-2-db-layer.md).
 *
 * Tables owned here (dashboard owns migrations):
 *   - Better Auth core: user (+ persona_id, status), session, account,
 *     verification, and twoFactor plugin tables
 *   - RBAC:   role, permission, role_permission, user_role     (ADR 0003)
 *   - App:    invitation, audit_log, error_log                 (ADR 0005, 0008)
 *
 * Frozen reference tables (introspect, NEVER generate/migrate):
 *   - Personas, Closers, Calendarios                           (ADR 0008)
 *   user.persona_id soft-links to Personas.id, app-validated   (ADR 0004)
 *
 * Full column definitions: docs/adr/0003, 0004, 0008 and plan.md §4.
 */

import { mysqlTable, varchar } from 'drizzle-orm/mysql-core'

// Frozen reference table — schema mirrored for typing only, do not migrate.
export const personas = mysqlTable('Personas', {
  id: varchar('id', { length: 255 }).primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
})

// TODO(phase-2): define user, session, role, permission, role_permission,
// user_role, invitation, audit_log, error_log per the ADRs above.

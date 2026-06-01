import { defineConfig } from 'drizzle-kit';

// IMPORTANT: the three schema-frozen existing tables (Calendarios, Closers,
// Personas) must NEVER receive dashboard-authored migrations (plan §4.1 / §4.7,
// docs/db/ownership.md). They are declared in src/db/schema/existing.ts for
// typed, full-CRUD *data* access at runtime (via src/db/index.ts), but they are
// deliberately kept out of the migration generator's input here.
//
// We point `schema` at the dashboard-owned files ONLY — NOT the runtime barrel
// (index.ts), which also re-exports existing.ts. `tablesFilter` does NOT cover
// `drizzle-kit generate` (it only applies to push/introspect/studio), so
// excluding the file from `schema` is the reliable guard for `generate`. We
// keep tablesFilter as defense-in-depth for those other commands.
export default defineConfig({
  dialect: 'mysql',
  schema: ['./src/db/schema/auth.ts', './src/db/schema/rbac.ts', './src/db/schema/app.ts'],
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  tablesFilter: ['!Calendarios', '!Closers', '!Personas'],
  verbose: true,
  strict: true,
});

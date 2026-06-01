import { defineConfig } from 'drizzle-kit';

// IMPORTANT: tablesFilter EXCLUDES the three schema-frozen existing tables
// (Calendarios, Closers, Personas). They are declared in Drizzle for typed,
// full-CRUD data access (src/db/schema/existing.ts) but the dashboard must
// NEVER author migrations that ALTER/DROP them. See docs/db/ownership.md and
// the plan §4.1 / §4.7.
export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // Migrations are generated ONLY for dashboard-owned tables.
  tablesFilter: ['!Calendarios', '!Closers', '!Personas'],
  verbose: true,
  strict: true,
});

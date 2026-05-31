import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'mysql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
  // The dashboard owns migrations. The frozen tables (Personas, Closers,
  // Calendarios) are introspected, never generated. See docs/db/ownership.md.
  tablesFilter: ['!Personas', '!Closers', '!Calendarios'],
  verbose: true,
  strict: true,
})

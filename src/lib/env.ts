import { z } from 'zod';

// Validate environment at boot. Fail fast with a clear message.
const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required (Evergreen via SSH tunnel in dev)'),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url(),
  // Existing Express server (`server-achievers`). For now EVERY request from the
  // dashboard targets the production server, even in dev — there is no local
  // server URL yet. Override only when that changes.
  SERVER_URL: z.string().url().default('https://server.achieversacademy.es'),
  // `achievers-comercial-system` (the sales platform, https://market.achievers.es).
  // Its `public-project-metrics` Supabase Edge Function feeds the VIP sales
  // indicator; the key is the function's `PUBLIC_PROJECT_METRICS_API_KEY`.
  SALES_METRICS_URL: z
    .string()
    .url()
    .default('https://bgbbckfqdplingyhnmbn.supabase.co/functions/v1/public-project-metrics'),
  SALES_METRICS_API_KEY: z.string().default(''),
  PUBLIC_STATS_API_KEY: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  RESEND_FROM: z.string().default('Achievers <no-reply@achieversacademy.es>'),
  ADMIN_EMAIL: z.string().email().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment:\n', parsed.error.flatten().fieldErrors);
  throw new Error('Environment validation failed. See .env.example.');
}

export const env = parsed.data;

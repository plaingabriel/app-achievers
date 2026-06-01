import { db, schema } from '@/db/index';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';
import { env } from './env';

// Better Auth server instance (plan §4.4, §8).
// - email + password, invitation-only (no public signup; see invitations flow)
// - TOTP + backup codes via the twoFactor plugin
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'mysql', schema }),
  emailAndPassword: {
    enabled: true,
    // Registration is invitation-only; the invitation flow creates users.
    disableSignUp: true,
  },
  plugins: [twoFactor({ issuer: 'Achievers' })],
});

export type Session = typeof auth.$Infer.Session;

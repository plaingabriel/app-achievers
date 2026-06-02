import { auth } from '@/lib/auth';
import { createFileRoute } from '@tanstack/react-router';

// Mounts Better Auth at /api/auth/* (sign-in, sign-out, session, twoFactor…).
// The auth-client posts here; without this route the login flow 404s.
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
});

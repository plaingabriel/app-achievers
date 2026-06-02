import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from './auth';

// Resolves the current session server-side from the request cookies. Used by
// route guards (beforeLoad) to gate access; returns null when unauthenticated.
export const fetchSession = createServerFn({ method: 'GET' }).handler(async () => {
  const { headers } = getRequest();
  return auth.api.getSession({ headers });
});

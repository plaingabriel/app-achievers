import {
  captureApiRequestContext,
  createCorsPreflightResponse,
  createGrupo,
  handleApiError,
  listGrupos,
  logApiRequest,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/grupos')({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => createCorsPreflightResponse(request),
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await listGrupos(request);
        } catch (err) {
          return handleApiError('listGrupos', requestContext, err, request);
        }
      },
      POST: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        await logApiRequest('createGrupo', requestContext);
        try {
          return await createGrupo(request);
        } catch (err) {
          return handleApiError('createGrupo', requestContext, err, request);
        }
      },
    },
  },
});

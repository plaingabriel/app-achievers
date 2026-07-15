import {
  captureApiRequestContext,
  createCorsPreflightResponse,
  createEncuesta,
  handleApiError,
  listEncuestas,
  logApiRequest,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/encuestas' as never)({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => createCorsPreflightResponse(request),
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await listEncuestas(request);
        } catch (err) {
          return handleApiError('listEncuestas', requestContext, err, request);
        }
      },
      POST: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        await logApiRequest('createEncuesta', requestContext);
        try {
          return await createEncuesta(request);
        } catch (err) {
          return handleApiError('createEncuesta', requestContext, err, request);
        }
      },
    },
  },
});

import {
  captureApiRequestContext,
  createRegistro,
  handleApiError,
  listRegistros,
  logApiRequest,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/registros')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await listRegistros(request);
        } catch (err) {
          return handleApiError('listRegistros', requestContext, err);
        }
      },
      POST: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        await logApiRequest('createRegistro', requestContext);
        try {
          return await createRegistro(request);
        } catch (err) {
          return handleApiError('createRegistro', requestContext, err);
        }
      },
    },
  },
});

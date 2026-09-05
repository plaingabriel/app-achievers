import {
  captureApiRequestContext,
  getPublicProjectsList,
  handleApiError,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/proyectos')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await getPublicProjectsList(request);
        } catch (err) {
          return handleApiError('getPublicProjectsList', requestContext, err, request);
        }
      },
    },
  },
});

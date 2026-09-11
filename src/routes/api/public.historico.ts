import {
  captureApiRequestContext,
  getPublicHistoricalList,
  handleApiError,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/historico')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await getPublicHistoricalList(request);
        } catch (err) {
          return handleApiError('getPublicHistoricalList', requestContext, err, request);
        }
      },
    },
  },
});

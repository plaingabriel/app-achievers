import {
  captureApiRequestContext,
  getPublicMetricsCatalog,
  handleApiError,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/metricas')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await getPublicMetricsCatalog(request);
        } catch (err) {
          return handleApiError('getPublicMetricsCatalog', requestContext, err, request);
        }
      },
    },
  },
});

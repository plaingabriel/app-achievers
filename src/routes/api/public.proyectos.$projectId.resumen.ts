import {
  captureApiRequestContext,
  getPublicProjectGroupedSummary,
  handleApiError,
  parseNumericRouteParam,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/proyectos/$projectId/resumen')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await getPublicProjectGroupedSummary(request, projectId);
        } catch (err) {
          return handleApiError('getPublicProjectGroupedSummary', requestContext, err, request);
        }
      },
    },
  },
});

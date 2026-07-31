import {
  captureApiRequestContext,
  getPublicProjectOrigins,
  handleApiError,
  parseNumericRouteParam,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/proyectos/$projectId/origenes')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await getPublicProjectOrigins(request, projectId);
        } catch (err) {
          return handleApiError('getPublicProjectOrigins', requestContext, err, request);
        }
      },
    },
  },
});

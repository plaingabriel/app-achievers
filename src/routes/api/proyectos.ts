import {
  captureApiRequestContext,
  createProject,
  handleApiError,
  listProjects,
  logApiRequest,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/proyectos')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        try {
          return await listProjects(request);
        } catch (err) {
          return handleApiError('listProjects', requestContext, err);
        }
      },
      POST: async ({ request }) => {
        const requestContext = await captureApiRequestContext(request);
        await logApiRequest('createProject', requestContext);
        try {
          return await createProject(request);
        } catch (err) {
          return handleApiError('createProject', requestContext, err);
        }
      },
    },
  },
});

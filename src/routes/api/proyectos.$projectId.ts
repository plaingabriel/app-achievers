import {
  captureApiRequestContext,
  deleteProject,
  getProject,
  handleApiError,
  logApiRequest,
  parseNumericRouteParam,
  updateProject,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/proyectos/$projectId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await getProject(request, projectId);
        } catch (err) {
          return handleApiError('getProject', requestContext, err);
        }
      },
      PUT: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        await logApiRequest('updateProject', requestContext);
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await updateProject(request, projectId);
        } catch (err) {
          return handleApiError('updateProject', requestContext, err);
        }
      },
      PATCH: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        await logApiRequest('updateProject', requestContext);
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await updateProject(request, projectId);
        } catch (err) {
          return handleApiError('updateProject', requestContext, err);
        }
      },
      DELETE: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await deleteProject(request, projectId);
        } catch (err) {
          return handleApiError('deleteProject', requestContext, err);
        }
      },
    },
  },
});

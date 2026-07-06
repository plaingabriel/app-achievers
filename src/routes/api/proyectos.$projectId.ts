import {
  deleteProject,
  getProject,
  handleApiError,
  parseNumericRouteParam,
  updateProject,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/proyectos/$projectId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await getProject(request, projectId);
        } catch (err) {
          return handleApiError('getProject', { projectId: params.projectId }, err);
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await updateProject(request, projectId);
        } catch (err) {
          return handleApiError('updateProject', { projectId: params.projectId }, err);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await updateProject(request, projectId);
        } catch (err) {
          return handleApiError('updateProject', { projectId: params.projectId }, err);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const projectId = parseNumericRouteParam(params.projectId, 'projectId');
          return await deleteProject(request, projectId);
        } catch (err) {
          return handleApiError('deleteProject', { projectId: params.projectId }, err);
        }
      },
    },
  },
});

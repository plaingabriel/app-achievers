import {
  captureApiRequestContext,
  deleteGrupo,
  getGrupo,
  handleApiError,
  logApiRequest,
  parseNumericRouteParam,
  updateGrupo,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/grupos/$grupoId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          grupoId: params.grupoId,
        };
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await getGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('getGrupo', requestContext, err);
        }
      },
      PUT: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          grupoId: params.grupoId,
        };
        await logApiRequest('updateGrupo', requestContext);
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await updateGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('updateGrupo', requestContext, err);
        }
      },
      PATCH: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          grupoId: params.grupoId,
        };
        await logApiRequest('updateGrupo', requestContext);
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await updateGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('updateGrupo', requestContext, err);
        }
      },
      DELETE: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          grupoId: params.grupoId,
        };
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await deleteGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('deleteGrupo', requestContext, err);
        }
      },
    },
  },
});

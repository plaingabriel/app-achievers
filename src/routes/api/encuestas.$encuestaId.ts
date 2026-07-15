import {
  captureApiRequestContext,
  deleteEncuesta,
  getEncuesta,
  handleApiError,
  logApiRequest,
  parseNumericRouteParam,
  updateEncuesta,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/encuestas/$encuestaId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const encuestaParams = params as { encuestaId: string };
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          encuestaId: encuestaParams.encuestaId,
        };
        try {
          const encuestaId = parseNumericRouteParam(encuestaParams.encuestaId, 'encuestaId');
          return await getEncuesta(request, encuestaId);
        } catch (err) {
          return handleApiError('getEncuesta', requestContext, err);
        }
      },
      PUT: async ({ request, params }) => {
        const encuestaParams = params as { encuestaId: string };
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          encuestaId: encuestaParams.encuestaId,
        };
        await logApiRequest('updateEncuesta', requestContext);
        try {
          const encuestaId = parseNumericRouteParam(encuestaParams.encuestaId, 'encuestaId');
          return await updateEncuesta(request, encuestaId);
        } catch (err) {
          return handleApiError('updateEncuesta', requestContext, err);
        }
      },
      PATCH: async ({ request, params }) => {
        const encuestaParams = params as { encuestaId: string };
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          encuestaId: encuestaParams.encuestaId,
        };
        await logApiRequest('updateEncuesta', requestContext);
        try {
          const encuestaId = parseNumericRouteParam(encuestaParams.encuestaId, 'encuestaId');
          return await updateEncuesta(request, encuestaId);
        } catch (err) {
          return handleApiError('updateEncuesta', requestContext, err);
        }
      },
      DELETE: async ({ request, params }) => {
        const encuestaParams = params as { encuestaId: string };
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          encuestaId: encuestaParams.encuestaId,
        };
        try {
          const encuestaId = parseNumericRouteParam(encuestaParams.encuestaId, 'encuestaId');
          return await deleteEncuesta(request, encuestaId);
        } catch (err) {
          return handleApiError('deleteEncuesta', requestContext, err);
        }
      },
    },
  },
});

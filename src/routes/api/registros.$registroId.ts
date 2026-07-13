import {
  captureApiRequestContext,
  deleteRegistro,
  getRegistro,
  handleApiError,
  logApiRequest,
  parseNumericRouteParam,
  updateRegistro,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/registros/$registroId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          registroId: params.registroId,
        };
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await getRegistro(request, registroId);
        } catch (err) {
          return handleApiError('getRegistro', requestContext, err);
        }
      },
      PUT: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          registroId: params.registroId,
        };
        await logApiRequest('updateRegistro', requestContext);
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await updateRegistro(request, registroId);
        } catch (err) {
          return handleApiError('updateRegistro', requestContext, err);
        }
      },
      PATCH: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          registroId: params.registroId,
        };
        await logApiRequest('updateRegistro', requestContext);
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await updateRegistro(request, registroId);
        } catch (err) {
          return handleApiError('updateRegistro', requestContext, err);
        }
      },
      DELETE: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          registroId: params.registroId,
        };
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await deleteRegistro(request, registroId);
        } catch (err) {
          return handleApiError('deleteRegistro', requestContext, err);
        }
      },
    },
  },
});

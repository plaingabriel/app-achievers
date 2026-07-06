import {
  deleteRegistro,
  getRegistro,
  handleApiError,
  parseNumericRouteParam,
  updateRegistro,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/registros/$registroId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await getRegistro(request, registroId);
        } catch (err) {
          return handleApiError('getRegistro', { registroId: params.registroId }, err);
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await updateRegistro(request, registroId);
        } catch (err) {
          return handleApiError('updateRegistro', { registroId: params.registroId }, err);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await updateRegistro(request, registroId);
        } catch (err) {
          return handleApiError('updateRegistro', { registroId: params.registroId }, err);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const registroId = parseNumericRouteParam(params.registroId, 'registroId');
          return await deleteRegistro(request, registroId);
        } catch (err) {
          return handleApiError('deleteRegistro', { registroId: params.registroId }, err);
        }
      },
    },
  },
});

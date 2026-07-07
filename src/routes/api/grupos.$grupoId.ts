import {
  deleteGrupo,
  getGrupo,
  handleApiError,
  parseNumericRouteParam,
  updateGrupo,
} from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/grupos/$grupoId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await getGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('getGrupo', { grupoId: params.grupoId }, err);
        }
      },
      PUT: async ({ request, params }) => {
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await updateGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('updateGrupo', { grupoId: params.grupoId }, err);
        }
      },
      PATCH: async ({ request, params }) => {
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await updateGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('updateGrupo', { grupoId: params.grupoId }, err);
        }
      },
      DELETE: async ({ request, params }) => {
        try {
          const grupoId = parseNumericRouteParam(params.grupoId, 'grupoId');
          return await deleteGrupo(request, grupoId);
        } catch (err) {
          return handleApiError('deleteGrupo', { grupoId: params.grupoId }, err);
        }
      },
    },
  },
});

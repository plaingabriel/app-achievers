import { createGrupo, handleApiError, listGrupos } from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/grupos')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listGrupos(request);
        } catch (err) {
          return handleApiError('listGrupos', {}, err);
        }
      },
      POST: async ({ request }) => {
        try {
          return await createGrupo(request);
        } catch (err) {
          return handleApiError('createGrupo', {}, err);
        }
      },
    },
  },
});

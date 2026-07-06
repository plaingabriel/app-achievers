import { createRegistro, handleApiError, listRegistros } from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/registros')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listRegistros(request);
        } catch (err) {
          return handleApiError('listRegistros', {}, err);
        }
      },
      POST: async ({ request }) => {
        try {
          return await createRegistro(request);
        } catch (err) {
          return handleApiError('createRegistro', {}, err);
        }
      },
    },
  },
});

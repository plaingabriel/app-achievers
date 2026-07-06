import { createProject, handleApiError, listProjects } from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/proyectos')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          return await listProjects(request);
        } catch (err) {
          return handleApiError('listProjects', {}, err);
        }
      },
      POST: async ({ request }) => {
        try {
          return await createProject(request);
        } catch (err) {
          return handleApiError('createProject', {}, err);
        }
      },
    },
  },
});

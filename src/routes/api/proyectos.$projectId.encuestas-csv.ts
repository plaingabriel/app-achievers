import { exportEncuestasCsv } from '@/lib/encuestas-csv-export';
import { captureApiRequestContext, handleApiError } from '@/lib/proyectos-registros-api';
import { createFileRoute } from '@tanstack/react-router';

// Session-authenticated CSV download for the dashboard's Encuestas view. Lives
// as an API route rather than a server function so the rows can be streamed
// instead of buffered into a single JSON payload.
export const Route = createFileRoute('/api/proyectos/$projectId/encuestas-csv')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const requestContext = {
          ...(await captureApiRequestContext(request)),
          projectId: params.projectId,
        };
        try {
          const projectId = Number(params.projectId);
          if (!Number.isInteger(projectId) || projectId <= 0) {
            return new Response(JSON.stringify({ error: 'El proyecto no existe.' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json; charset=utf-8' },
            });
          }
          return await exportEncuestasCsv(request, projectId);
        } catch (err) {
          return handleApiError('exportEncuestasCsv', requestContext, err);
        }
      },
    },
  },
});

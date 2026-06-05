import { NotFound } from '@/components/NotFound';
import { es } from '@/i18n/es';
import { fetchSessionContext } from '@/lib/auth-server';
import appCss from '@/styles/app.css?url';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  // Resolve the session + RBAC permissions once per navigation and expose them
  // on the router context, so child routes can gate access (see index.tsx /
  // login.tsx beforeLoad, requirePermission) and the chrome can hide unreachable
  // nav (Sidebar).
  beforeLoad: async () => fetchSessionContext(),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: es.app.name },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/assets/mark.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
});

// Dark mode only — no theme toggle (plan §1).
function RootDocument() {
  return (
    <html lang="es" className="bg-grid">
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}

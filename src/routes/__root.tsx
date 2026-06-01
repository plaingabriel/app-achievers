import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { NotFound } from '~/components/NotFound';
import { es } from '~/i18n/es';
import appCss from '~/styles/app.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: es.app.name },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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

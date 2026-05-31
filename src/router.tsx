import { Link, createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function NotFound() {
  return (
    <main style={{ padding: 'var(--space-12)' }}>
      <p className="label bracket-label">404</p>
      <h1 className="h1">Page not found</h1>
      <p className="body-sm" style={{ marginTop: 'var(--space-2)' }}>
        That route doesn't exist. Check the address or return to the dashboard.
      </p>
      <p className="body-sm" style={{ marginTop: 'var(--space-6)' }}>
        <Link to="/">Go to dashboard →</Link>
      </p>
    </main>
  )
}

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultNotFoundComponent: NotFound,
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

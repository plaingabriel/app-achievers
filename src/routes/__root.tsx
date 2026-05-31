import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import tokens from '~/styles/tokens.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'App Achievers' },
    ],
    links: [{ rel: 'stylesheet', href: tokens }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-grid">
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}

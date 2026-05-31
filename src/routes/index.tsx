import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  // Placeholder shell. Real screens are built in later phases — see docs/phases.
  // Follow the Achievers design system (.claude/skills/achievers-design).
  return (
    <main style={{ padding: 'var(--space-12)' }}>
      <p className="label bracket-label">STATUS</p>
      <h1 className="h1">Achievers_</h1>
      <p className="body-sm" style={{ marginTop: 'var(--space-2)' }}>
        Scaffold online. Build the dashboard per docs/phases.
      </p>
    </main>
  )
}

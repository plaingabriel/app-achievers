import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { es } from '@/i18n/es';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  // Session gate: unauthenticated visitors go to /login (plan §8, phase 04).
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
  },
  component: DashboardPage,
});

// App shell + dashboard placeholder. Real widgets land in later phases
// (see docs/phases). Auth/RBAC gating is wired in phases 04 + 06.
function DashboardPage() {
  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Topbar crumbs={[es.app.name, es.nav.dashboard]} />
        <div className="p-6">
          <h1 className="h1">{es.nav.dashboard}</h1>
          <p className="body-sm mt-2">
            <span className="bracket-label text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
              SCAFFOLD
            </span>{' '}
            Las vistas reales se construyen por fases.
          </p>
        </div>
      </div>
    </div>
  );
}

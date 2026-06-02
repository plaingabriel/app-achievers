import { AppShell } from '@/components/AppShell';
import { es } from '@/i18n/es';
import { requireUser } from '@/lib/route-guards';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  // Session gate + first-login password change (plan §8, phases 04–05).
  beforeLoad: ({ context }) => requireUser(context.session),
  component: DashboardPage,
});

// App shell + dashboard placeholder. Real widgets land in later phases
// (see docs/phases). Auth/RBAC gating is wired in phases 04 + 06.
function DashboardPage() {
  return (
    <AppShell crumbs={[es.app.name, es.nav.dashboard]}>
      <h1 className="h1">{es.nav.dashboard}</h1>
      <p className="body-sm mt-2">
        <span className="bracket-label text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
          SCAFFOLD
        </span>{' '}
        Las vistas reales se construyen por fases.
      </p>
    </AppShell>
  );
}

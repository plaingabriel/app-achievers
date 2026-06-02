import { AppShell } from '@/components/AppShell';
import { TwoFactorCard } from '@/components/TwoFactorCard';
import { es } from '@/i18n/es';
import { requireUser } from '@/lib/route-guards';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/settings/')({
  beforeLoad: ({ context }) => requireUser(context.session),
  component: SettingsPage,
});

// Settings → Security. 2FA enrollment / disable (phase 05). More sections
// (members, roles, etc.) land in later phases.
function SettingsPage() {
  return (
    <AppShell crumbs={[es.app.name, es.nav.settings]}>
      <h1 className="h1">{es.settings.title}</h1>
      <div className="bracket-label mt-2 mb-5 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {es.settings.security}
      </div>
      <TwoFactorCard />
    </AppShell>
  );
}

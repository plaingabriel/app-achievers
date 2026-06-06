import { es } from '@/i18n/es';
import type { Permission } from '@/lib/permissions';
import { hasPermission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { Link, useRouteContext, useRouterState } from '@tanstack/react-router';

// Gating (ADR 0014): `adminOnly` items render only for admins (the management
// screens); `perm` items render for admins or users holding that grant (the data
// tables). Items with neither (dashboard, settings) are reachable by any
// signed-in user.
type Item = { key: string; label: string; to: string; perm?: Permission; adminOnly?: boolean };

const workspace: Item[] = [
  { key: 'dashboard', label: es.nav.dashboard, to: '/' },
  { key: 'members', label: es.nav.members, to: '/members', adminOnly: true },
  { key: 'personas', label: es.nav.personas, to: '/personas', perm: 'personas:read' },
  { key: 'closers', label: es.nav.closers, to: '/closers', perm: 'closers:read' },
  { key: 'calendarios', label: es.nav.calendarios, to: '/calendarios', perm: 'calendarios:read' },
  { key: 'logs', label: es.nav.logs, to: '/logs', adminOnly: true },
  { key: 'audit', label: es.nav.audit, to: '/audit', adminOnly: true },
];
const setup: Item[] = [
  { key: 'permissions', label: es.nav.permissions, to: '/permissions', adminOnly: true },
  { key: 'invitations', label: es.nav.invitations, to: '/invitations', adminOnly: true },
  { key: 'settings', label: es.nav.settings, to: '/settings' },
];

export function Sidebar() {
  // Active item follows the current URL (so the page you're on is highlighted,
  // even on a 404 where the route itself isn't matched).
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Hide nav the user can't reach (ADR 0014). Access comes from the root route
  // context, resolved server-side per request. Admins see everything.
  const { isAdmin, permissions } = useRouteContext({ from: '__root__' });
  const visible = (items: Item[]) =>
    items.filter((it) => {
      if (it.adminOnly) return isAdmin;
      if (it.perm) return isAdmin || hasPermission(permissions, it.perm);
      return true;
    });

  const Group = ({ title, items }: { title: string; items: Item[] }) =>
    items.length === 0 ? null : (
      <div className="px-3 pt-3.5 pb-1.5">
        <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
          {title}
        </div>
        {items.map((it) => {
          const isActive = it.to === '/' ? pathname === '/' : pathname.startsWith(it.to);
          return (
            <Link
              key={it.key}
              to={it.to}
              className={cn(
                'relative flex items-center gap-2.5 border border-transparent px-2.5 py-1.75 text-[12px] transition-colors duration-140 ease-achievers hover:bg-bg-2 hover:text-fg-1',
                isActive ? 'border-hair-2 bg-bg-2 text-fg-1' : 'text-fg-2',
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 bg-brand" />
              )}
              <span>{it.label}</span>
            </Link>
          );
        })}
      </div>
    );

  return (
    <aside className="flex flex-col border-r border-hair-2 bg-bg-0 py-4.5">
      <div className="border-b border-hair-1 px-4.5 pb-5">
        <div className="flex items-center gap-2.5">
          <img src="/assets/mark.svg" alt="" width={22} height={22} />
          <div className="text-[16px] font-bold tracking-[-0.02em] text-fg-1">
            {es.app.name.toLowerCase()}
          </div>
        </div>
        <div className="mt-2 text-[10px] uppercase tracking-[0.08em] text-fg-3">
          prod · Evergreen
        </div>
      </div>
      <Group title={es.nav.workspace} items={visible(workspace)} />
      <Group title={es.nav.setup} items={visible(setup)} />
    </aside>
  );
}

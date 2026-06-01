import { es } from '@/i18n/es';
import { cn } from '@/lib/utils';
import { Link } from '@tanstack/react-router';

type Item = { key: string; label: string; to: string };

const workspace: Item[] = [
  { key: 'dashboard', label: es.nav.dashboard, to: '/' },
  { key: 'members', label: es.nav.members, to: '/members' },
  { key: 'personas', label: es.nav.personas, to: '/personas' },
  { key: 'closers', label: es.nav.closers, to: '/closers' },
  { key: 'calendarios', label: es.nav.calendarios, to: '/calendarios' },
  { key: 'logs', label: es.nav.logs, to: '/logs' },
  { key: 'audit', label: es.nav.audit, to: '/audit' },
];
const setup: Item[] = [
  { key: 'roles', label: es.nav.roles, to: '/roles' },
  { key: 'invitations', label: es.nav.invitations, to: '/invitations' },
  { key: 'settings', label: es.nav.settings, to: '/settings' },
];

export function Sidebar({ active }: { active: string }) {
  const Group = ({ title, items }: { title: string; items: Item[] }) => (
    <div className="px-3 pt-3.5 pb-1.5">
      <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {title}
      </div>
      {items.map((it) => {
        const isActive = active === it.key;
        return (
          <Link
            key={it.key}
            to={it.to}
            className={cn(
              'flex items-center gap-2.5 border border-transparent px-2.5 py-1.75 text-[12px] transition-colors duration-140 ease-achievers hover:bg-bg-2 hover:text-fg-1',
              isActive ? 'border-hair-2 bg-bg-2 text-fg-1' : 'text-fg-2',
            )}
          >
            <span
              className={cn(
                '-ml-2.5 mr-2 h-3.5 w-0.5 bg-brand',
                isActive ? 'visible' : 'invisible',
              )}
            />
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
      <Group title={es.nav.workspace} items={workspace} />
      <Group title={es.nav.setup} items={setup} />
    </aside>
  );
}

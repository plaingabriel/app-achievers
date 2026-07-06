import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { signOut } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function Topbar({ crumbs = [] }: { crumbs?: string[] }) {
  // Clears the session, then a full load so the gate sends us to /login.
  async function onLogout() {
    await signOut();
    window.location.assign('/login');
  }

  return (
    <header className="relative z-10 flex h-12 items-center gap-4 border-b border-hair-2 bg-bg-0 px-5">
      <div className="flex items-center gap-2 text-[12px] text-fg-2">
        {crumbs.map((c, i) => (
          <span key={c} className={cn(i === crumbs.length - 1 && 'text-fg-1')}>
            {i > 0 ? ' / ' : ''}
            {c}
          </span>
        ))}
      </div>
      <div className="flex-1" />
      <div className="flex h-7.5 w-70 items-center gap-2 border border-hair-2 bg-bg-1 px-2.5 text-[12px] text-fg-3">
        <span>{es.common.search}</span>
        <span className="ml-auto border border-hair-2 bg-bg-1 px-1.25 py-px text-[10px] text-fg-3">
          ⌘K
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={onLogout}>
        {es.common.logout}
      </Button>
    </header>
  );
}

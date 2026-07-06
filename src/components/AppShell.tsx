import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import type { ReactNode } from 'react';

// App shell: sidebar + topbar + content. Shared by the authenticated routes so
// the grid/chrome lives in one place (see index.tsx, settings/index.tsx).
export function AppShell({ crumbs, children }: { crumbs?: string[]; children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr] overflow-x-clip">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Topbar crumbs={crumbs} />
        <div className="min-w-0 overflow-x-auto p-6">{children}</div>
      </div>
    </div>
  );
}

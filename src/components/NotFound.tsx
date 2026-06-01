import { Sidebar } from '@/components/Sidebar';
import { Topbar } from '@/components/Topbar';
import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { Link } from '@tanstack/react-router';

// Default 404. Renders inside the app shell so the dashboard chrome
// (sidebar + topbar) stays visible at all times — a missing route never
// blanks out the whole app.
export function NotFound() {
  return (
    <div className="grid min-h-screen grid-cols-[248px_1fr]">
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <Topbar crumbs={[es.app.name, es.notFound.title]} />
        <div className="p-6">
          <span className="bracket-label text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
            {es.notFound.eyebrow}
          </span>
          <h1 className="h1 mt-2">{es.notFound.title}</h1>
          <p className="body-sm mt-2">{es.notFound.body}</p>
          <Button asChild variant="default" className="mt-4">
            <Link to="/">{es.notFound.back}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { ACTIONS, GRANTABLE_RESOURCES } from '@/lib/permissions';
import { fetchPermissionsData, setUserAdmin, setUserPermissions } from '@/lib/permissions-server';
import { requireAdmin } from '@/lib/route-guards';
import { cn } from '@/lib/utils';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/permissions/')({
  // Admin-only access screen (ADR 0014). Mutations re-check admin server-side.
  beforeLoad: ({ context }) => requireAdmin(context),
  loader: () => fetchPermissionsData(),
  component: PermissionsPage,
});

type Data = Awaited<ReturnType<typeof fetchPermissionsData>>;
type User = Data['users'][number];

function PermissionsPage() {
  const data = Route.useLoaderData();

  return (
    <AppShell crumbs={[es.app.name, es.nav.permissions]}>
      <h1 className="h1">{es.permissions.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.permissions.subtitle}</p>

      <UsersSection data={data} />
    </AppShell>
  );
}

function UsersSection({ data }: { data: Data }) {
  const router = useRouter();
  // Editable grant draft per non-admin user, seeded from the loaded set. After a
  // save we invalidate the loader, so the rendered "original" set catches up and
  // the dirty flag clears on its own.
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(data.users.map((u) => [u.id, new Set(u.permissions)])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const toggle = (userId: string, perm: string) =>
    setDraft((d) => {
      const next = new Set(d[userId]);
      next.has(perm) ? next.delete(perm) : next.add(perm);
      return { ...d, [userId]: next };
    });

  const isDirty = (userId: string, original: string[]) => {
    const cur = draft[userId] ?? new Set();
    return cur.size !== original.length || original.some((p) => !cur.has(p));
  };

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError('');
    setBusy(key);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? es.errors.generic);
        return;
      }
      await router.invalidate();
    } catch (err) {
      console.error('[permissions] mutation failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  const Cell = ({ userId, perm }: { userId: string; perm: string }) => {
    const active = draft[userId]?.has(perm) ?? false;
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={() => toggle(userId, perm)}
        className={cn(
          'block size-5 border transition-colors duration-140 ease-achievers hover:border-hair-4',
          active ? 'border-brand bg-primary' : 'border-hair-2 bg-transparent',
        )}
      />
    );
  };

  return (
    <section className="mt-7">
      <div className="bracket-label mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {es.permissions.usersHeading}
      </div>
      {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}

      {data.users.length === 0 && <p className="text-[12px] text-fg-3">{es.permissions.noUsers}</p>}

      <div className="space-y-4">
        {data.users.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            busy={busy}
            isDirty={isDirty}
            onToggle={toggle}
            onSave={() =>
              run(`save:${u.id}`, () =>
                setUserPermissions({
                  data: { userId: u.id, permissions: [...(draft[u.id] ?? [])] },
                }),
              )
            }
            onSetAdmin={(isAdmin) =>
              run(`admin:${u.id}`, () => setUserAdmin({ data: { userId: u.id, isAdmin } }))
            }
            Cell={Cell}
          />
        ))}
      </div>
    </section>
  );
}

function UserCard({
  user,
  busy,
  isDirty,
  onSave,
  onSetAdmin,
  Cell,
}: {
  user: User;
  busy: string | null;
  isDirty: (userId: string, original: string[]) => boolean;
  onToggle: (userId: string, perm: string) => void;
  onSave: () => void;
  onSetAdmin: (isAdmin: boolean) => void;
  Cell: (props: { userId: string; perm: string }) => React.ReactElement;
}) {
  const adminBusy = busy === `admin:${user.id}`;
  const saveBusy = busy === `save:${user.id}`;

  return (
    <div className="border border-hair-2 bg-bg-1 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-fg-1">{user.name}</span>
            {user.isAdmin && <Badge>{es.permissions.adminBadge}</Badge>}
          </div>
          <div className="mt-0.5 text-[12px] text-fg-3">{user.email}</div>
        </div>
        <div className="flex items-center gap-2">
          {!user.isAdmin && (
            <Button
              variant="primary"
              size="sm"
              disabled={saveBusy || !isDirty(user.id, user.permissions)}
              onClick={onSave}
            >
              {es.permissions.savePermissions}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            disabled={adminBusy}
            onClick={() => onSetAdmin(!user.isAdmin)}
          >
            {user.isAdmin ? es.permissions.removeAdmin : es.permissions.makeAdmin}
          </Button>
        </div>
      </div>

      {user.isAdmin ? (
        <p className="text-[11px] text-fg-3">{es.permissions.adminNote}</p>
      ) : (
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-fg-3">
              <th className="w-40 py-1.5 text-left font-medium" />
              {ACTIONS.map((a) => (
                <th key={a} className="px-2 py-1.5 text-left font-medium">
                  {es.permissions.action[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GRANTABLE_RESOURCES.map((resource) => (
              <tr key={resource} className="border-t border-hair-1">
                <td className="py-1.5 text-fg-2">{es.permissions.resource[resource]}</td>
                {ACTIONS.map((a) => (
                  <td key={a} className="px-2 py-1.5">
                    <Cell userId={user.id} perm={`${resource}:${a}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

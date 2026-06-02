import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { ACTIONS, RESOURCES, hasPermission } from '@/lib/permissions';
import { assignRole, fetchRolesData, revokeRole, setRolePermissions } from '@/lib/roles-server';
import { requirePermission } from '@/lib/route-guards';
import { cn } from '@/lib/utils';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/roles/')({
  // Admin RBAC screen — needs roles:read to view (plan §4.4). Mutations re-check
  // roles:write server-side; the UI only enables the controls when held.
  beforeLoad: ({ context }) => requirePermission(context, 'roles:read'),
  loader: () => fetchRolesData(),
  component: RolesPage,
});

type Data = Awaited<ReturnType<typeof fetchRolesData>>;

function RolesPage() {
  const data = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canWrite = hasPermission(permissions, 'roles:write');

  return (
    <AppShell crumbs={[es.app.name, es.nav.roles]}>
      <h1 className="h1">{es.roles.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.roles.subtitle}</p>

      <PermissionsSection data={data} canWrite={canWrite} />
      <UsersSection data={data} canWrite={canWrite} />
    </AppShell>
  );
}

// — Permissions per role ————————————————————————————————————————————————
function PermissionsSection({ data, canWrite }: { data: Data; canWrite: boolean }) {
  const router = useRouter();
  // permissionId for a given resource:action, from the catalog.
  const permId = new Map(data.permissions.map((p) => [`${p.resource}:${p.action}`, p.id]));
  const auditReadAll = permId.get('audit:read_all');

  // Editable draft per role, seeded from the loaded permission set. After a save
  // we invalidate the loader, so the rendered "original" set catches up and the
  // dirty flag clears on its own.
  const [draft, setDraft] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(data.roles.map((r) => [r.id, new Set(r.permissionIds)])),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const toggle = (roleId: string, pid: string) =>
    setDraft((d) => {
      const next = new Set(d[roleId]);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return { ...d, [roleId]: next };
    });

  const isDirty = (roleId: string, original: string[]) => {
    const cur = draft[roleId] ?? new Set();
    return cur.size !== original.length || original.some((p) => !cur.has(p));
  };

  async function save(roleId: string) {
    setError('');
    setBusy(roleId);
    try {
      const res = await setRolePermissions({
        data: { roleId, permissionIds: [...(draft[roleId] ?? [])] },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
    } catch (err) {
      console.error('[roles] save permissions failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  const Cell = ({ roleId, pid, readOnly }: { roleId: string; pid?: string; readOnly: boolean }) => {
    if (!pid) return <span className="block size-5" />;
    const active = draft[roleId]?.has(pid) ?? false;
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={readOnly}
        onClick={() => toggle(roleId, pid)}
        className={cn(
          'block size-5 border transition-colors duration-140 ease-achievers',
          active ? 'border-brand bg-primary' : 'border-hair-2 bg-transparent',
          readOnly ? 'cursor-default opacity-70' : 'hover:border-hair-4',
        )}
      />
    );
  };

  return (
    <section className="mt-7">
      <div className="bracket-label mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {es.roles.permissionsHeading}
      </div>
      {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}

      <div className="space-y-4">
        {data.roles.map((role) => {
          const readOnly = role.isSystem || !canWrite;
          return (
            <div key={role.id} className="border border-hair-2 bg-bg-1 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold text-fg-1">
                      {role.name}
                    </span>
                    {role.isSystem && <Badge>{es.roles.systemBadge}</Badge>}
                  </div>
                  {role.description && (
                    <div className="mt-0.5 text-[12px] text-fg-3">{role.description}</div>
                  )}
                </div>
                {!role.isSystem && canWrite && (
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy === role.id || !isDirty(role.id, role.permissionIds)}
                    onClick={() => save(role.id)}
                  >
                    {es.roles.savePermissions}
                  </Button>
                )}
              </div>

              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr className="text-fg-3">
                    <th className="w-40 py-1.5 text-left font-medium" />
                    {ACTIONS.map((a) => (
                      <th key={a} className="px-2 py-1.5 text-left font-medium">
                        {es.roles.action[a]}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-left font-medium">
                      {es.roles.action.read_all}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RESOURCES.map((resource) => (
                    <tr key={resource} className="border-t border-hair-1">
                      <td className="py-1.5 text-fg-2">{es.roles.resource[resource]}</td>
                      {ACTIONS.map((a) => (
                        <td key={a} className="px-2 py-1.5">
                          <Cell
                            roleId={role.id}
                            pid={permId.get(`${resource}:${a}`)}
                            readOnly={readOnly}
                          />
                        </td>
                      ))}
                      <td className="px-2 py-1.5">
                        {resource === 'audit' && (
                          <Cell roleId={role.id} pid={auditReadAll} readOnly={readOnly} />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {role.isSystem && <p className="mt-2 text-[11px] text-fg-3">{es.roles.systemNote}</p>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// — Roles per user ——————————————————————————————————————————————————————
function UsersSection({ data, canWrite }: { data: Data; canWrite: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function toggleRole(userId: string, roleId: string, has: boolean) {
    setError('');
    setBusy(`${userId}:${roleId}`);
    try {
      const res = has
        ? await revokeRole({ data: { userId, roleId } })
        : await assignRole({ data: { userId, roleId } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
    } catch (err) {
      console.error('[roles] toggle role failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-9">
      <div className="bracket-label mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {es.roles.usersHeading}
      </div>
      {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}

      <div className="border border-hair-2 bg-bg-1">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-hair-2 text-fg-3">
              <th className="px-4 py-2.5 text-left font-medium">{es.roles.userColName}</th>
              <th className="px-4 py-2.5 text-left font-medium">{es.roles.userColRoles}</th>
            </tr>
          </thead>
          <tbody>
            {data.users.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-4 text-fg-3">
                  {es.roles.noUsers}
                </td>
              </tr>
            )}
            {data.users.map((u) => (
              <tr key={u.id} className="border-t border-hair-1 align-top">
                <td className="px-4 py-3">
                  <div className="text-fg-1">{u.name}</div>
                  <div className="text-[11px] text-fg-3">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {data.roles.map((role) => {
                      const has = u.roleIds.includes(role.id);
                      const cellBusy = busy === `${u.id}:${role.id}`;
                      return (
                        <button
                          key={role.id}
                          type="button"
                          disabled={!canWrite || cellBusy}
                          aria-pressed={has}
                          onClick={() => toggleRole(u.id, role.id, has)}
                          title={has ? es.roles.revoke : es.roles.grant}
                          className={cn(
                            'rounded-none border px-2 py-[3px] font-mono text-[11px] uppercase tracking-[0.06em] transition-colors duration-140 ease-achievers',
                            has
                              ? 'border-brand bg-primary text-primary-foreground'
                              : 'border-hair-2 bg-transparent text-fg-3',
                            canWrite && !cellBusy && 'hover:border-hair-4',
                            !canWrite && 'cursor-default',
                          )}
                        >
                          {role.name}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

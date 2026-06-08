import { AppShell } from '@/components/AppShell';
import { Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { createInvitation, fetchInvitationsData, revokeInvitation } from '@/lib/invitations-server';
import { ACTIONS, GRANTABLE_RESOURCES } from '@/lib/permissions';
import { requireAdmin } from '@/lib/route-guards';
import { cn } from '@/lib/utils';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/invitations/')({
  // Admin-only onboarding (ADR 0014). Mutations re-check admin server-side.
  beforeLoad: ({ context }) => requireAdmin(context),
  loader: () => fetchInvitationsData(),
  component: InvitationsPage,
});

type Data = Awaited<ReturnType<typeof fetchInvitationsData>>;
type Invitation = Data['invitations'][number];

const STATUS_VARIANT = {
  pending: 'info',
  used: 'success',
  expired: 'idle',
} as const;

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

// Short summary of the access an invite grants, for the list column.
function accessLabel(inv: Invitation): string {
  if (inv.isAdmin) return es.invitations.adminBadge;
  const resources = new Set(inv.permissions.map((p) => p.split(':')[0]));
  if (resources.size === 0) return es.invitations.noAccess;
  return [...resources].map((r) => es.permissions.resource[r as never] ?? r).join(', ');
}

function InvitationsPage() {
  const data = Route.useLoaderData();

  return (
    <AppShell crumbs={[es.app.name, es.nav.invitations]}>
      <h1 className="h1">{es.invitations.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.invitations.subtitle}</p>

      <CreateForm />
      <InvitationsList data={data} />
    </AppShell>
  );
}

function CreateForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ devUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const togglePerm = (perm: string) =>
    setPerms((s) => {
      const next = new Set(s);
      next.has(perm) ? next.delete(perm) : next.add(perm);
      return next;
    });

  async function onSend() {
    setError('');
    setSent(null);
    setBusy(true);
    try {
      const res = await createInvitation({
        data: { email, isAdmin, permissions: [...perms] },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent({ devUrl: res.acceptUrl });
      setEmail('');
      setIsAdmin(false);
      setPerms(new Set());
      await router.invalidate();
    } catch (err) {
      console.error('[invitations] create failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 max-w-2xl border border-hair-2 bg-bg-1 p-4">
      <div className="flex items-end gap-3">
        <div className="min-w-[18rem] flex-1">
          <Label htmlFor="invite-email" required>
            {es.invitations.emailLabel}
          </Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <Button variant="primary" disabled={busy || !email} onClick={onSend}>
          {es.invitations.send}
        </Button>
      </div>

      <label className="mt-4 flex w-fit items-center gap-2 text-[12px] text-fg-2">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="size-3.5 accent-[var(--color-brand)]"
        />
        {es.invitations.adminLabel}
      </label>

      {!isAdmin && (
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
            {es.invitations.permissionsLabel}
          </div>
          <table className="border-collapse text-[12px]">
            <thead>
              <tr className="text-fg-3">
                <th className="w-32 py-1.5 text-left font-medium" />
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
                  {ACTIONS.map((a) => {
                    const perm = `${resource}:${a}`;
                    const active = perms.has(perm);
                    return (
                      <td key={a} className="px-2 py-1.5">
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => togglePerm(perm)}
                          className={cn(
                            'block size-5 border transition-colors duration-140 ease-achievers hover:border-hair-4',
                            active ? 'border-brand bg-primary' : 'border-hair-2 bg-transparent',
                          )}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
      {sent && (
        <div className="mt-3 text-[12px] text-fg-2">
          <span className="text-success">{es.invitations.sent}</span>
          {sent.devUrl && (
            <div className="mt-1 break-all text-fg-3">
              {es.invitations.devLink}{' '}
              <a href={sent.devUrl} className="text-brand hover:underline">
                {sent.devUrl}
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function InvitationsList({ data }: { data: Data }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function onRevoke(id: string) {
    setError('');
    setBusy(id);
    try {
      const res = await revokeInvitation({ data: { id } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await router.invalidate();
    } catch (err) {
      console.error('[invitations] revoke failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-7">
      <div className="bracket-label mb-3 text-[11px] font-medium uppercase tracking-[0.08em] text-fg-3">
        {es.invitations.listHeading}
      </div>
      {error && <p className="mb-3 text-[12px] text-danger">{error}</p>}

      <Table<Invitation>
        columns={[
          {
            key: 'email',
            header: es.invitations.colEmail,
            sortValue: (inv) => inv.email,
            render: (inv) => <span className="text-fg-1">{inv.email}</span>,
          },
          {
            key: 'access',
            header: es.invitations.colAccess,
            sortValue: (inv) => accessLabel(inv),
            render: (inv) => <span className="text-fg-2">{accessLabel(inv)}</span>,
          },
          {
            key: 'status',
            header: es.invitations.colStatus,
            sortValue: (inv) => inv.status,
            render: (inv) => (
              <Badge variant={STATUS_VARIANT[inv.status]}>
                {es.invitations.status[inv.status]}
              </Badge>
            ),
          },
          {
            key: 'expires',
            header: es.invitations.colExpires,
            sortValue: (inv) => new Date(inv.expiresAt).getTime(),
            render: (inv) => <span className="text-fg-3">{fmtDate(inv.expiresAt)}</span>,
          },
        ]}
        rows={data.invitations}
        getRowKey={(inv) => inv.id}
        empty={es.invitations.empty}
        actions={(inv) =>
          inv.status === 'pending' ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === inv.id}
              onClick={() => onRevoke(inv.id)}
            >
              {es.invitations.revoke}
            </Button>
          ) : null
        }
      />
    </section>
  );
}

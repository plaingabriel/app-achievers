import { AppShell } from '@/components/AppShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { createInvitation, fetchInvitationsData, revokeInvitation } from '@/lib/invitations-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/invitations/')({
  // Admin-only onboarding (plan §4.4). Mutations re-check invitations:write
  // server-side; the seeded matrix grants invitations:* to admin only.
  beforeLoad: ({ context }) => requirePermission(context, 'invitations:read'),
  loader: () => fetchInvitationsData(),
  component: InvitationsPage,
});

type Data = Awaited<ReturnType<typeof fetchInvitationsData>>;

const STATUS_VARIANT = {
  pending: 'info',
  used: 'success',
  expired: 'idle',
} as const;

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

function InvitationsPage() {
  const data = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canWrite = permissions.includes('invitations:write');

  return (
    <AppShell crumbs={[es.app.name, es.nav.invitations]}>
      <h1 className="h1">{es.invitations.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.invitations.subtitle}</p>

      {canWrite && <CreateForm data={data} />}
      <InvitationsList data={data} canWrite={canWrite} />
    </AppShell>
  );
}

function CreateForm({ data }: { data: Data }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState(data.roles[0]?.id ?? '');
  const [error, setError] = useState('');
  const [sent, setSent] = useState<{ devUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSend() {
    setError('');
    setSent(null);
    setBusy(true);
    try {
      const res = await createInvitation({ data: { email, roleId } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSent({ devUrl: res.acceptUrl });
      setEmail('');
      await router.invalidate();
    } catch (err) {
      console.error('[invitations] create failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-7 max-w-lg border border-hair-2 bg-bg-1 p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="invite-email">{es.invitations.emailLabel}</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="w-36">
          <Label htmlFor="invite-role">{es.invitations.roleLabel}</Label>
          <select
            id="invite-role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            className="h-8 w-full border border-hair-2 bg-bg-1 px-2 text-[13px] text-fg-1 outline-none focus-visible:shadow-(--shadow-focus)"
          >
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <Button variant="primary" disabled={busy || !email} onClick={onSend}>
          {es.invitations.send}
        </Button>
      </div>

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

function InvitationsList({ data, canWrite }: { data: Data; canWrite: boolean }) {
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

      <div className="border border-hair-2 bg-bg-1">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-hair-2 text-fg-3">
              <th className="px-4 py-2.5 text-left font-medium">{es.invitations.colEmail}</th>
              <th className="px-4 py-2.5 text-left font-medium">{es.invitations.colRole}</th>
              <th className="px-4 py-2.5 text-left font-medium">{es.invitations.colStatus}</th>
              <th className="px-4 py-2.5 text-left font-medium">{es.invitations.colExpires}</th>
              <th className="px-4 py-2.5 text-right font-medium" />
            </tr>
          </thead>
          <tbody>
            {data.invitations.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-fg-3">
                  {es.invitations.empty}
                </td>
              </tr>
            )}
            {data.invitations.map((inv) => (
              <tr key={inv.id} className="border-t border-hair-1">
                <td className="px-4 py-3 text-fg-1">{inv.email}</td>
                <td className="px-4 py-3 font-mono text-fg-2">{inv.roleName}</td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[inv.status]}>
                    {es.invitations.status[inv.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-fg-3">{fmtDate(inv.expiresAt)}</td>
                <td className="px-4 py-3 text-right">
                  {canWrite && inv.status === 'pending' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy === inv.id}
                      onClick={() => onRevoke(inv.id)}
                    >
                      {es.invitations.revoke}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

import { AppShell } from '@/components/AppShell';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Modal } from '@/components/Modal';
import { Table } from '@/components/Table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import {
  deleteMember,
  fetchMembersData,
  forcePasswordChange,
  resetMemberPassword,
  setMemberStatus,
} from '@/lib/members-server';
import { requirePermission } from '@/lib/route-guards';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/members/')({
  // Admin-only user lifecycle. Mutations re-check members:write / members:delete
  // server-side; the seeded matrix grants members:* to admin only.
  beforeLoad: ({ context }) => requirePermission(context, 'members:read'),
  loader: () => fetchMembersData(),
  component: MembersPage,
});

type Data = Awaited<ReturnType<typeof fetchMembersData>>;
type Member = Data['members'][number];
type ActionResult = { ok: boolean; error?: string };

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });

function MembersPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const { permissions } = Route.useRouteContext();
  const canWrite = permissions.includes('members:write');
  const canDelete = permissions.includes('members:delete');

  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [resetTarget, setResetTarget] = useState<Member | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Member | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.members;
    return data.members.filter(
      (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
    );
  }, [data.members, query]);

  async function run(action: () => Promise<ActionResult>, userId: string) {
    setError('');
    setBusy(userId);
    try {
      const res = await action();
      if (!res.ok) {
        setError(res.error ?? es.errors.generic);
        return;
      }
      await router.invalidate();
    } catch (err) {
      console.error('[members] action failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell crumbs={[es.app.name, es.nav.members]}>
      <h1 className="h1">{es.members.title}</h1>
      <p className="body-sm mt-2 text-fg-3">{es.members.subtitle}</p>

      <div className="mt-7 flex items-center justify-between gap-3">
        <Input
          className="max-w-xs"
          placeholder={es.common.search}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="text-[12px] text-fg-3">
          {rows.length} {es.common.records}
        </span>
      </div>

      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}

      <div className="mt-3">
        <Table<Member>
          columns={[
            {
              key: 'user',
              header: es.members.colUser,
              render: (m) => (
                <div>
                  <div className="text-fg-1">{m.name}</div>
                  <div className="text-fg-3">{m.email}</div>
                </div>
              ),
            },
            {
              key: 'roles',
              header: es.members.colRoles,
              render: (m) => (
                <span className="text-fg-2">
                  {m.roles.length > 0 ? m.roles.join(', ') : es.members.noRoles}
                </span>
              ),
            },
            {
              key: '2fa',
              header: es.members.col2fa,
              render: (m) => (
                <Badge variant={m.twoFactorEnabled ? 'success' : 'idle'}>
                  {m.twoFactorEnabled ? es.members.twoFactorOn : es.members.twoFactorOff}
                </Badge>
              ),
            },
            {
              key: 'status',
              header: es.members.colStatus,
              render: (m) => (
                <Badge variant={m.status === 'active' ? 'success' : 'danger'}>
                  {m.status === 'active' ? es.members.statusActive : es.members.statusSuspended}
                </Badge>
              ),
            },
            {
              key: 'created',
              header: es.members.colCreated,
              render: (m) => (
                <span className="whitespace-nowrap text-fg-3">{fmtDate(m.createdAt)}</span>
              ),
            },
            {
              key: 'last',
              header: es.members.colLastLogin,
              render: (m) => (
                <span className="whitespace-nowrap text-fg-3">
                  {m.lastLogin ? fmtDate(m.lastLogin) : '—'}
                </span>
              ),
            },
          ]}
          rows={rows}
          getRowKey={(m) => m.id}
          empty={query ? es.data.noResults : es.common.empty}
          actions={
            canWrite || canDelete
              ? (m) => {
                  // Self-row: no lifecycle actions (manage your own account in Ajustes).
                  if (m.id === data.currentUserId) {
                    return <span className="text-[11px] text-fg-4">—</span>;
                  }
                  const rowBusy = busy === m.id;
                  return (
                    <div className="flex justify-end gap-1">
                      {canWrite && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() =>
                              run(
                                () =>
                                  setMemberStatus({
                                    data: {
                                      userId: m.id,
                                      status: m.status === 'active' ? 'suspended' : 'active',
                                    },
                                  }),
                                m.id,
                              )
                            }
                          >
                            {m.status === 'active' ? es.members.suspend : es.members.reactivate}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() => setResetTarget(m)}
                          >
                            {es.members.resetPassword}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={rowBusy}
                            onClick={() =>
                              run(() => forcePasswordChange({ data: { userId: m.id } }), m.id)
                            }
                          >
                            {es.members.forceChange}
                          </Button>
                        </>
                      )}
                      {canDelete && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={rowBusy}
                          className="text-danger hover:bg-danger-bg hover:text-danger"
                          onClick={() => setDeleteTarget(m)}
                        >
                          {es.common.delete}
                        </Button>
                      )}
                    </div>
                  );
                }
              : undefined
          }
        />
      </div>

      {resetTarget && (
        <ResetPasswordModal member={resetTarget} onClose={() => setResetTarget(null)} />
      )}
      {deleteTarget && (
        <DeleteMemberDialog member={deleteTarget} onClose={() => setDeleteTarget(null)} />
      )}
    </AppShell>
  );
}

function ResetPasswordModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onConfirm() {
    setError('');
    setBusy(true);
    try {
      const res = await resetMemberPassword({ data: { userId: member.id } });
      if (!res.ok) {
        setError(res.error ?? es.errors.generic);
        return;
      }
      setTempPw(res.tempPassword ?? '');
      await router.invalidate();
    } catch (err) {
      console.error('[members] reset failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!tempPw) return;
    try {
      await navigator.clipboard.writeText(tempPw);
      setCopied(true);
    } catch {
      // Clipboard may be unavailable; the value is visible to copy manually.
    }
  }

  return (
    <Modal title={es.members.resetTitle} onClose={onClose}>
      <p className="text-[13px] text-fg-2">{es.members.resetBody}</p>
      <p className="mt-2 text-[12px] text-fg-3">{member.email}</p>

      {!tempPw ? (
        <>
          {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="default" size="sm" disabled={busy} onClick={onClose}>
              {es.common.cancel}
            </Button>
            <Button variant="primary" size="sm" disabled={busy} onClick={onConfirm}>
              {busy ? es.common.loading : es.members.resetConfirm}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4">
            <Label>{es.members.tempPasswordLabel}</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all border border-hair-2 bg-bg-0 px-3 py-2 font-mono text-[13px] text-fg-1">
                {tempPw}
              </code>
              <Button variant="default" size="sm" onClick={copy}>
                {copied ? es.members.copied : es.members.copy}
              </Button>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <Button variant="primary" size="sm" onClick={onClose}>
              {es.common.close}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function DeleteMemberDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onConfirm() {
    setError('');
    setBusy(true);
    try {
      const res = await deleteMember({ data: { userId: member.id } });
      if (!res.ok) {
        setError(res.error ?? es.errors.generic);
        return;
      }
      await router.invalidate();
      onClose();
    } catch (err) {
      console.error('[members] delete failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      title={es.members.deleteTitle}
      body={`${es.members.deleteBody} (${member.email})`}
      busy={busy}
      error={error}
      onConfirm={onConfirm}
      onCancel={onClose}
    />
  );
}

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { acceptInvitation, getInvitation } from '@/lib/invitations-server';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/accept-invite/')({
  // Public — the invitee has no account yet. The token is validated server-side
  // on load (to show the email/role) and again on submit (single-use, §4.4).
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === 'string' ? search.token : '',
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: ({ deps }) => getInvitation({ data: { token: deps.token } }),
  component: AcceptInvitePage,
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grid p-5">
      <div className="w-95 border border-hair-2 bg-bg-1 p-7">
        <div className="mb-7 flex items-center text-[22px] font-bold tracking-[-0.02em]">
          <img src="/assets/mark.svg" alt="" width={28} height={28} className="mr-3" />
          <span>{es.app.name.toLowerCase()}</span>
        </div>
        {children}
      </div>
    </div>
  );
}

function AcceptInvitePage() {
  const info = Route.useLoaderData();
  const { token } = Route.useSearch();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Invalid / expired / used invitation: explain and point to login.
  if (!info.ok) {
    return (
      <Shell>
        <div className="mb-1 text-[14px] font-semibold">{es.acceptInvite.title}</div>
        <div className="mb-5.5 text-[12px] text-danger">{info.error}</div>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => goToLogin()}>
          {es.acceptInvite.goToLogin}
        </Button>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="mb-1 text-[14px] font-semibold">{es.acceptInvite.title}</div>
        <div className="mb-5.5 text-[12px] text-success">{es.acceptInvite.success}</div>
        <Button variant="primary" size="lg" className="w-full" onClick={() => goToLogin()}>
          {es.acceptInvite.goToLogin}
        </Button>
      </Shell>
    );
  }

  async function onSubmit() {
    setError('');
    if (password.length < 8) {
      setError(es.changePassword.tooShort);
      return;
    }
    if (password !== repeat) {
      setError(es.changePassword.mismatch);
      return;
    }
    setBusy(true);
    try {
      const res = await acceptInvitation({ data: { token, name, password } });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch (err) {
      console.error('[accept-invite] failed', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mb-1 text-[14px] font-semibold">{es.acceptInvite.title}</div>
      <div className="mb-5.5 text-[12px] text-fg-3">
        {es.acceptInvite.subtitle} <span className="text-fg-2">{info.email}</span>
      </div>

      <div className="mb-3.5">
        <Label htmlFor="name">{es.acceptInvite.name}</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mb-3.5">
        <Label htmlFor="password">{es.acceptInvite.password}</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="mb-3.5">
        <Label htmlFor="repeat">{es.acceptInvite.repeat}</Label>
        <Input
          id="repeat"
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>

      {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={busy || !name}
        onClick={onSubmit}
      >
        {es.acceptInvite.submit}
      </Button>
    </Shell>
  );
}

function goToLogin() {
  window.location.assign('/login');
}

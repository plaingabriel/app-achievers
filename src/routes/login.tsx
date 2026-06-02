import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { signIn } from '@/lib/auth-client';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/login')({
  // Already signed in? Skip the form and go to the dashboard.
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

// Spanish UI, Achievers brand. Mirrors the design-system Login kit component.
function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit() {
    const res = await signIn.email({ email, password });
    if (res.error) setError(es.errors.generic);
    else window.location.assign('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid p-5">
      <div className="w-95 border border-hair-2 bg-bg-1 p-7">
        <div className="mb-7 flex items-center text-[22px] font-bold tracking-[-0.02em]">
          <img src="/assets/mark.svg" alt="" width={28} height={28} className="mr-3" />
          <span>{es.app.name.toLowerCase()}</span>
        </div>
        <div className="mb-1 text-[14px] font-semibold">{es.login.title}</div>
        <div className="mb-5.5 text-[12px] text-fg-3">{es.login.subtitle}</div>

        <div className="mb-3.5">
          <Label htmlFor="email">{es.login.email}</Label>
          <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="mb-3.5">
          <Label htmlFor="password">{es.login.password}</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

        <Button variant="primary" size="lg" className="w-full" onClick={onSubmit}>
          {es.login.continue}
        </Button>

        <div className="mt-5.5 flex justify-between border-t border-hair-1 pt-4.5 text-[11px] text-fg-3">
          <a href="/forgot-password" className="text-fg-2 hover:text-brand">
            {es.login.forgot}
          </a>
        </div>
      </div>
    </div>
  );
}

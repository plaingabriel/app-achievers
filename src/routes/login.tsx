import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { signIn, twoFactor } from '@/lib/auth-client';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { useState } from 'react';

export const Route = createFileRoute('/login')({
  // Already signed in? Skip the form and go to the dashboard.
  beforeLoad: ({ context }) => {
    if (context.session) throw redirect({ to: '/' });
  },
  component: LoginPage,
});

type Step = 'credentials' | 'totp' | 'backup';

// Spanish UI, Achievers brand. Mirrors the design-system Login kit component.
// Two-step: email+password, then a 2FA challenge when the user has TOTP enabled
// (sign-in returns twoFactorRedirect instead of a session — plan §4.4, phase 05).
function LoginPage() {
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCredentials() {
    setError('');
    setBusy(true);
    const res = await signIn.email({ email, password });
    setBusy(false);
    if (res.error) {
      setError(es.errors.generic);
      return;
    }
    if (res.data && 'twoFactorRedirect' in res.data && res.data.twoFactorRedirect) {
      setCode('');
      setStep('totp');
      return;
    }
    window.location.assign('/');
  }

  async function onVerify() {
    setError('');
    setBusy(true);
    const res =
      step === 'backup'
        ? await twoFactor.verifyBackupCode({ code })
        : await twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) {
      setError(es.errors.invalidCode);
      return;
    }
    window.location.assign('/');
  }

  const isChallenge = step !== 'credentials';

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid p-5">
      <div className="w-95 border border-hair-2 bg-bg-1 p-7">
        <div className="mb-7 flex items-center text-[22px] font-bold tracking-[-0.02em]">
          <img src="/assets/mark.svg" alt="" width={28} height={28} className="mr-3" />
          <span>{es.app.name.toLowerCase()}</span>
        </div>

        {!isChallenge && (
          <>
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

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={onCredentials}
            >
              {es.login.continue}
            </Button>

            <div className="mt-5.5 flex justify-between border-t border-hair-1 pt-4.5 text-[11px] text-fg-3">
              <a href="/forgot-password" className="text-fg-2 hover:text-brand">
                {es.login.forgot}
              </a>
            </div>
          </>
        )}

        {isChallenge && (
          <>
            <div className="mb-1 text-[14px] font-semibold">{es.login.twoFactorTitle}</div>
            <div className="mb-5.5 text-[12px] text-fg-3">
              {step === 'backup' ? es.login.backupSubtitle : es.login.twoFactorSubtitle}
            </div>

            <div className="mb-3.5">
              <Label htmlFor="code">
                {step === 'backup' ? es.login.backupCode : es.login.twoFactor}
              </Label>
              <Input
                id="code"
                inputMode={step === 'backup' ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

            <Button
              variant="primary"
              size="lg"
              className="w-full"
              disabled={busy}
              onClick={onVerify}
            >
              {es.login.verify}
            </Button>

            <div className="mt-5.5 flex justify-between border-t border-hair-1 pt-4.5 text-[11px] text-fg-3">
              <button
                type="button"
                className="text-fg-2 hover:text-brand"
                onClick={() => {
                  setError('');
                  setCode('');
                  setStep(step === 'backup' ? 'totp' : 'backup');
                }}
              >
                {step === 'backup' ? es.login.useTotp : es.login.useBackup}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

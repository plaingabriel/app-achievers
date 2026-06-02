import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { twoFactor, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

type Phase = 'idle' | 'enable-password' | 'verify' | 'disable-password';

// TOTP enrollment + disable. Enable returns the otpauth URI (rendered as a QR)
// and the one-time backup codes; verifyTotp confirms the first code and flips
// twoFactorEnabled on the user (Better Auth default flow). Disable needs the
// password. Audit events for these are wired in phase 10.
export function TwoFactorCard() {
  const { data } = useSession();
  const enabled = !!data?.user.twoFactorEnabled;

  const [phase, setPhase] = useState<Phase>('idle');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function reset() {
    setPhase('idle');
    setPassword('');
    setCode('');
    setTotpUri('');
    setBackupCodes([]);
    setError('');
    setBusy(false);
  }

  async function onEnable() {
    setError('');
    setBusy(true);
    const res = await twoFactor.enable({ password });
    setBusy(false);
    if (res.error || !res.data) {
      setError(es.errors.invalidPassword);
      return;
    }
    setTotpUri(res.data.totpURI);
    setBackupCodes(res.data.backupCodes);
    setPassword('');
    setPhase('verify');
  }

  async function onVerify() {
    setError('');
    setBusy(true);
    const res = await twoFactor.verifyTotp({ code });
    setBusy(false);
    if (res.error) {
      setError(es.errors.invalidCode);
      return;
    }
    window.location.reload();
  }

  async function onDisable() {
    setError('');
    setBusy(true);
    const res = await twoFactor.disable({ password });
    setBusy(false);
    if (res.error) {
      setError(es.errors.invalidPassword);
      return;
    }
    window.location.reload();
  }

  // otpauth://totp/Issuer:email?secret=...&issuer=... — pull the secret for
  // manual entry when a camera isn't available.
  const secret = totpUri ? (new URL(totpUri).searchParams.get('secret') ?? '') : '';

  return (
    <section className="w-150 max-w-full border border-hair-2 bg-bg-1 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[14px] font-semibold">{es.twoFactor.title}</div>
          <div className="mt-1 text-[12px] text-fg-3">{es.twoFactor.description}</div>
        </div>
        <span
          className={cn(
            'shrink-0 border px-2 py-0.5 text-[11px] uppercase tracking-[0.08em]',
            enabled ? 'border-success text-success' : 'border-hair-2 text-fg-3',
          )}
        >
          {enabled ? es.twoFactor.enabled : es.twoFactor.disabled}
        </span>
      </div>

      {phase === 'idle' && (
        <div className="mt-5">
          {enabled ? (
            <Button variant="secondary" onClick={() => setPhase('disable-password')}>
              {es.twoFactor.disable}
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setPhase('enable-password')}>
              {es.twoFactor.enable}
            </Button>
          )}
        </div>
      )}

      {(phase === 'enable-password' || phase === 'disable-password') && (
        <div className="mt-5">
          <div className="mb-2 text-[12px] text-fg-3">{es.twoFactor.passwordPrompt}</div>
          <div className="mb-3.5 w-72 max-w-full">
            <Label htmlFor="tfa-password">{es.login.password}</Label>
            <Input
              id="tfa-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}
          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={busy}
              onClick={phase === 'enable-password' ? onEnable : onDisable}
            >
              {phase === 'enable-password' ? es.twoFactor.enable : es.twoFactor.disable}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {es.common.cancel}
            </Button>
          </div>
        </div>
      )}

      {phase === 'verify' && (
        <div className="mt-5">
          <div className="mb-2 text-[12px] text-fg-2">{es.twoFactor.scan}</div>
          <div className="inline-block bg-white p-3">
            <QRCodeSVG value={totpUri} size={176} />
          </div>
          <div className="mt-3 text-[11px] text-fg-3">{es.twoFactor.manualKey}</div>
          <div className="mt-1 break-all font-mono text-[12px] text-fg-1">{secret}</div>

          <div className="mt-5 border border-hair-2 bg-bg-0 p-4">
            <div className="text-[12px] font-semibold">{es.twoFactor.backupTitle}</div>
            <div className="mt-1 text-[11px] text-fg-3">{es.twoFactor.backupHint}</div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[12px] text-fg-1">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>

          <div className="mt-5 mb-2 text-[12px] text-fg-3">{es.twoFactor.verifyPrompt}</div>
          <div className="mb-3.5 w-60 max-w-full">
            <Label htmlFor="tfa-code">{es.twoFactor.code}</Label>
            <Input
              id="tfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy} onClick={onVerify}>
              {es.twoFactor.confirm}
            </Button>
            <Button variant="ghost" onClick={reset}>
              {es.common.cancel}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

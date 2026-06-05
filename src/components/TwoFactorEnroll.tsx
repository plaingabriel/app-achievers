import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { twoFactor } from '@/lib/auth-client';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';

type Phase = 'password' | 'verify';

// Shared TOTP enrollment flow used by the Settings card and the forced
// /setup-2fa step. `enable` returns the otpauth URI (rendered as a QR) and the
// one-time backup codes; `verifyTotp` confirms the first code and flips
// twoFactorEnabled on the user (Better Auth default flow). onComplete fires once
// enrollment is confirmed. A "Cancelar" button shows only when onCancel is set
// (Settings); the forced setup omits it so the step can't be skipped.
export function TwoFactorEnroll({
  onComplete,
  onCancel,
}: {
  onComplete: () => void;
  onCancel?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>('password');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [totpUri, setTotpUri] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
    onComplete();
  }

  // otpauth://totp/Issuer:email?secret=...&issuer=... — pull the secret for
  // manual entry when a camera isn't available.
  const secret = totpUri ? (new URL(totpUri).searchParams.get('secret') ?? '') : '';

  if (phase === 'password') {
    return (
      <div>
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
          <Button variant="primary" disabled={busy} onClick={onEnable}>
            {es.twoFactor.enable}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              {es.common.cancel}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
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
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            {es.common.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}

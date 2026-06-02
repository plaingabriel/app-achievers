import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { es } from '@/i18n/es';
import { changePassword } from '@/lib/auth-client';
import { useState } from 'react';

// Reusable change-password form. Used by the forced first-login flow
// (/change-password) and could back a settings card later.
export function ChangePasswordForm({ onSuccess }: { onSuccess?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    setError('');
    if (next.length < 8) {
      setError(es.changePassword.tooShort);
      return;
    }
    if (next !== repeat) {
      setError(es.changePassword.mismatch);
      return;
    }
    setBusy(true);
    const res = await changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (res.error) {
      setError(es.errors.invalidPassword);
      return;
    }
    onSuccess?.();
  }

  return (
    <div>
      <div className="mb-3.5">
        <Label htmlFor="current-password">{es.changePassword.current}</Label>
        <Input
          id="current-password"
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
        />
      </div>
      <div className="mb-3.5">
        <Label htmlFor="new-password">{es.changePassword.new}</Label>
        <Input
          id="new-password"
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </div>
      <div className="mb-3.5">
        <Label htmlFor="repeat-password">{es.changePassword.repeat}</Label>
        <Input
          id="repeat-password"
          type="password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
        />
      </div>

      {error && <div className="mb-3 text-[12px] text-danger">{error}</div>}

      <Button variant="primary" size="lg" className="w-full" disabled={busy} onClick={onSubmit}>
        {es.changePassword.submit}
      </Button>
    </div>
  );
}

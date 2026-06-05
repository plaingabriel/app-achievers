import { TwoFactorEnroll } from '@/components/TwoFactorEnroll';
import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';
import { useState } from 'react';

// TOTP enrollment for Settings → Security. 2FA is mandatory (enforced by the
// route guard → /setup-2fa), so there's no disable path here: the card only
// shows the current status and lets a not-yet-enrolled user enroll. The enable →
// QR → verify flow lives in the shared TwoFactorEnroll component. Audit events
// for enable are wired in auth.ts.
export function TwoFactorCard() {
  const { data } = useSession();
  const enabled = !!data?.user.twoFactorEnabled;

  const [enrolling, setEnrolling] = useState(false);

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

      {!enabled && (
        <div className="mt-5">
          {enrolling ? (
            <TwoFactorEnroll
              onComplete={() => window.location.reload()}
              onCancel={() => setEnrolling(false)}
            />
          ) : (
            <Button variant="primary" onClick={() => setEnrolling(true)}>
              {es.twoFactor.enable}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

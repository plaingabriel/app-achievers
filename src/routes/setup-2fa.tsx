import { TwoFactorEnroll } from '@/components/TwoFactorEnroll';
import { es } from '@/i18n/es';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/setup-2fa')({
  // Must be logged in, but do NOT apply the mandatory-2FA redirect here (this is
  // where that redirect points) — only bounce anonymous users. A pending
  // password change takes precedence, so send those users to /change-password
  // first (keeps the order: password → 2FA).
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
    if (context.session.user.mustChangePassword) throw redirect({ to: '/change-password' });
  },
  component: Setup2faPage,
});

// Mandatory 2FA enrollment, forced after first login by requireUser (plan §4.4).
// Once TOTP is confirmed, twoFactorEnabled flips true and the guard lets the
// user through to the dashboard.
function Setup2faPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-grid p-5">
      <div className="w-95 border border-hair-2 bg-bg-1 p-7">
        <div className="mb-7 flex items-center text-[22px] font-bold tracking-[-0.02em]">
          <img src="/assets/mark.svg" alt="" width={28} height={28} className="mr-3" />
          <span>{es.app.name.toLowerCase()}</span>
        </div>
        <div className="mb-1 text-[14px] font-semibold">{es.setup2fa.title}</div>
        <div className="mb-5.5 text-[12px] text-fg-3">{es.setup2fa.subtitle}</div>
        <TwoFactorEnroll onComplete={() => window.location.assign('/')} />
      </div>
    </div>
  );
}

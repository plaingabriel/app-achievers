import { ChangePasswordForm } from '@/components/ChangePasswordForm';
import { es } from '@/i18n/es';
import { clearMustChangePassword } from '@/lib/auth-server';
import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/change-password')({
  // Must be logged in, but do NOT apply the must_change_password redirect here
  // (this is where that redirect points) — only bounce anonymous users.
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/login' });
  },
  component: ChangePasswordPage,
});

// Forced first-login password change (plan §8). After Better Auth confirms the
// new password, clear the flag server-side and continue to the dashboard.
function ChangePasswordPage() {
  async function onSuccess() {
    await clearMustChangePassword();
    window.location.assign('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-grid p-5">
      <div className="w-95 border border-hair-2 bg-bg-1 p-7">
        <div className="mb-7 flex items-center text-[22px] font-bold tracking-[-0.02em]">
          <img src="/assets/mark.svg" alt="" width={28} height={28} className="mr-3" />
          <span>{es.app.name.toLowerCase()}</span>
        </div>
        <div className="mb-1 text-[14px] font-semibold">{es.changePassword.title}</div>
        <div className="mb-5.5 text-[12px] text-fg-3">{es.changePassword.subtitle}</div>
        <ChangePasswordForm onSuccess={onSuccess} />
      </div>
    </div>
  );
}

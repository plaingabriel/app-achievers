import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';
import { type ReactNode, useEffect } from 'react';

// Lightweight modal dialog. The app has no Radix dialog primitive yet; this
// covers the create/edit forms and (via ConfirmDialog) destructive confirms.
// Closes on Escape and backdrop click. Sharp corners + modal elevation per the
// design system (cards use a 1px border; popovers/modals get a shadow).
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop as a real button: keyboard-dismissable, no a11y lint hacks. */}
      <button
        type="button"
        aria-label={es.common.cancel}
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg border border-hair-2 bg-bg-1 shadow-modal">
        <div className="flex items-center justify-between border-b border-hair-2 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-fg-1">{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {es.common.cancel}
          </Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

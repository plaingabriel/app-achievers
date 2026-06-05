import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { es } from '@/i18n/es';

// Destructive-action confirmation built on Modal. Used for row deletes on the
// data screens. The confirm button is styled danger; the server still re-checks
// the `:delete` permission, so this is UX, not the security boundary.
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-[13px] text-fg-2">{body}</p>
      {error && <p className="mt-3 text-[12px] text-danger">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="default" size="sm" disabled={busy} onClick={onCancel}>
          {es.common.cancel}
        </Button>
        <Button
          variant="default"
          size="sm"
          disabled={busy}
          onClick={onConfirm}
          className="border-danger text-danger hover:bg-danger-bg"
        >
          {busy ? es.common.loading : (confirmLabel ?? es.common.delete)}
        </Button>
      </div>
    </Modal>
  );
}

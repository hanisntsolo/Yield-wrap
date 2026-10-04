import { useState } from 'react';
import Modal from './Modal';
import Icon from './Icon';
import Spinner from './Spinner';

/**
 * Confirmation for destructive / important actions.
 * `onConfirm` may return a promise; the dialog shows a spinner and closes when it resolves.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  children,
}) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
      onClose?.();
    } catch {
      /* caller shows the toast; keep dialog open */
    } finally {
      setBusy(false);
    }
  };

  const toneBtn = tone === 'danger' ? 'btn-danger' : 'btn-primary';
  const toneIcon = tone === 'danger' ? 'bg-critical-light text-critical' : 'bg-primary-light text-primary';

  return (
    <Modal
      open={open}
      onClose={busy ? undefined : onClose}
      dismissible={!busy}
      size="sm"
      title={title}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button type="button" className={`btn ${toneBtn}`} onClick={handleConfirm} disabled={busy} data-autofocus>
            {busy ? <Spinner size={16} /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneIcon}`}>
          <Icon name={tone === 'danger' ? 'alert' : 'info'} />
        </div>
        <div className="text-sm text-slate-600">
          {message}
          {children}
        </div>
      </div>
    </Modal>
  );
}

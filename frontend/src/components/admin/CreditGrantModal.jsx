import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import { adminApi, errorMessage } from '../../services/api';
import { formatNumber } from '../../utils/formatters';

/** Admin: manual ad-credit grant / adjustment (POST /api/admin/users/{id}/credits). */
export default function CreditGrantModal({ user, onClose }) {
  const [credits, setCredits] = useState('100');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setCredits('100');
      setNote('');
      setError('');
    }
  }, [user]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(credits);
    if (!Number.isInteger(n) || n === 0 || Math.abs(n) > 100000) {
      setError('A whole number between −100,000 and 100,000, not 0');
      return;
    }
    setSaving(true);
    try {
      const res = await adminApi.grantCredits(user.id, n, note.trim() || (n > 0 ? 'Admin grant' : 'Admin adjustment'));
      toast.success(`${user.name}: ${n > 0 ? '+' : ''}${formatNumber(n)} credits · balance ${formatNumber(res?.credits)}`);
      onClose?.();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not adjust credits'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(user)}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      size="sm"
      title="Adjust ad credits"
      description={user ? `${user.name} · ${user.email}` : undefined}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="credit-grant-form" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Icon name="zap" size={16} />} Apply
          </button>
        </>
      }
    >
      <form id="credit-grant-form" onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label className="label" htmlFor="grant-credits">
            Credits <span className="text-critical">*</span>
          </label>
          <input
            id="grant-credits"
            type="number"
            step="1"
            min="-100000"
            max="100000"
            className={`input font-mono ${error ? 'input-error' : ''}`}
            value={credits}
            onChange={(e) => {
              setCredits(e.target.value);
              setError('');
            }}
            data-autofocus
          />
          {error ? <p className="field-error">{error}</p> : <p className="field-hint">Use a negative number to deduct.</p>}
        </div>
        <div>
          <label className="label" htmlFor="grant-note">
            Note
          </label>
          <input id="grant-note" className="input" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Launch promo" />
        </div>
      </form>
    </Modal>
  );
}

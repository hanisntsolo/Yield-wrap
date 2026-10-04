import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import { errorMessage, fieldErrors, volunteerApi } from '../../services/api';
import { donationTotalKg, formatKg } from '../../utils/formatters';

/** Food-safety audit at hand-over: receiver name + confirmed quantity are mandatory. */
export default function DeliveryConfirmModal({ task, open, onClose, onDelivered }) {
  const expected = donationTotalKg(task);
  const [receiver, setReceiver] = useState('');
  const [qty, setQty] = useState('');
  const [safe, setSafe] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setReceiver('');
      setQty(expected ? String(expected) : '');
      setSafe(false);
      setErrors({});
    }
  }, [open, expected]);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!receiver.trim()) next.receiver_name = 'Who received the food?';
    const q = Number(qty);
    if (!qty || !Number.isFinite(q) || q <= 0) next.quantity_confirmed_kg = 'Enter the quantity handed over';
    if (!safe) next.safe = 'Please confirm the food safety checklist';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const updated = await volunteerApi.updateTaskStatus(task.id, {
        status: 'delivered',
        receiver_name: receiver.trim(),
        quantity_confirmed_kg: q,
      });
      toast.success('Delivery confirmed — thank you for making a difference!');
      onDelivered?.(updated);
      onClose?.();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Could not confirm the delivery'));
    } finally {
      setSaving(false);
    }
  };

  const diff = expected && Number(qty) ? Number(qty) - expected : 0;

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title="Confirm delivery"
      description="Food safety audit — recorded with this delivery."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Back
          </button>
          <button type="submit" form="delivery-form" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Icon name="check-circle" size={16} />} Confirm delivered
          </button>
        </>
      }
    >
      <form id="delivery-form" onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="receiver-name" className="label">
            Receiver name <span className="text-critical">*</span>
          </label>
          <input
            id="receiver-name"
            className={`input ${errors.receiver_name ? 'input-error' : ''}`}
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="Name of the NGO staff member"
            autoComplete="off"
            data-autofocus
          />
          {errors.receiver_name ? <p className="field-error">{errors.receiver_name}</p> : null}
        </div>
        <div>
          <label htmlFor="qty-confirmed" className="label">
            Quantity confirmed (kg) <span className="text-critical">*</span>
          </label>
          <input
            id="qty-confirmed"
            type="number"
            min="0.1"
            step="0.1"
            inputMode="decimal"
            className={`input font-mono ${errors.quantity_confirmed_kg ? 'input-error' : ''}`}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
          {errors.quantity_confirmed_kg ? (
            <p className="field-error">{errors.quantity_confirmed_kg}</p>
          ) : expected ? (
            <p className={`field-hint ${Math.abs(diff) > 0.05 * expected ? 'text-[#B9770E]' : ''}`}>
              Listed quantity: <span className="font-mono">{formatKg(expected)}</span>
              {Math.abs(diff) > 0.05 * expected ? ' — differs from the listing; that is fine, just be accurate.' : ''}
            </p>
          ) : null}
        </div>
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${errors.safe ? 'border-critical bg-critical-light/40' : 'border-slate-200'}`}>
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1A7A4A]" checked={safe} onChange={(e) => setSafe(e.target.checked)} />
          <span className="text-slate-700">
            Food was kept covered and at a safe temperature, and packaging was intact at hand-over.
            {errors.safe ? <span className="mt-1 block text-xs font-medium text-critical">{errors.safe}</span> : null}
          </span>
        </label>
      </form>
    </Modal>
  );
}

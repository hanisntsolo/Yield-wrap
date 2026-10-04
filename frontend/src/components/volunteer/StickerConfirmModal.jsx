import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import { errorMessage, fieldErrors, volunteerApi } from '../../services/api';
import { formatNumber } from '../../utils/formatters';

/** At pickup: confirm how many ad stickers were applied before marking the food collected. */
export default function StickerConfirmModal({ task, open, onClose, onPickedUp }) {
  const pk = task?.packaging || {};
  const total = Math.max(0, Number(pk.stickers_total) || 0);
  const sponsored = Array.isArray(pk.sponsored) ? pk.sponsored : [];
  const [count, setCount] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCount(String(total));
      setError('');
    }
  }, [open, total]);

  const submit = async (e) => {
    e.preventDefault();
    const n = Number(count);
    if (count === '' || !Number.isInteger(n) || n < 0 || n > total) {
      setError(`Enter a whole number from 0 to ${total}`);
      return;
    }
    setSaving(true);
    try {
      const updated = await volunteerApi.updateTaskStatus(task.id, { status: 'picked_up', stickers_applied: n });
      toast.success(n === total ? 'Food collected · all stickers applied' : `Food collected · ${formatNumber(n)} of ${formatNumber(total)} stickers applied`);
      onPickedUp?.(updated);
      onClose?.();
    } catch (err) {
      const fe = fieldErrors(err);
      setError(fe.stickers_applied || '');
      toast.error(errorMessage(err, 'Could not update the task'));
    } finally {
      setSaving(false);
    }
  };

  const short = total - (Number(count) || 0);

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title="Stickers applied?"
      description="Sponsors pay per sticker, so please count accurately."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Back
          </button>
          <button type="submit" form="sticker-form" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Icon name="package" size={16} />} Food collected
          </button>
        </>
      }
    >
      <form id="sticker-form" onSubmit={submit} className="space-y-4" noValidate>
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 text-sm">
          {sponsored.map((s, i) => (
            <li key={s.campaign_id || i} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0 truncate">
                <span className="badge mr-2 bg-accent-light text-[#B9770E] ring-accent/30">Sponsored</span>
                {s.title} <span className="text-xs text-slate-500">· {s.owner_name}</span>
              </span>
              <span className="metric">{formatNumber(s.packets)}</span>
            </li>
          ))}
          {pk.own_ad ? (
            <li className="flex items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0 truncate">
                <span className="badge mr-2 bg-primary-light text-primary ring-primary/20">Donor</span>
                {pk.own_ad.title}
              </span>
              <span className="metric">{formatNumber(pk.own_ad.packets)}</span>
            </li>
          ) : null}
          <li className="flex items-center justify-between bg-surface px-4 py-2.5 font-semibold">
            <span>Total stickers</span>
            <span className="metric">{formatNumber(total)}</span>
          </li>
        </ul>
        <div>
          <label htmlFor="stickers-applied" className="label">
            Stickers applied <span className="text-critical">*</span>
          </label>
          <input
            id="stickers-applied"
            type="number"
            min="0"
            max={total}
            step="1"
            inputMode="numeric"
            className={`input font-mono ${error ? 'input-error' : ''}`}
            value={count}
            onChange={(e) => {
              setCount(e.target.value);
              setError('');
            }}
            data-autofocus
          />
          {error ? (
            <p className="field-error">{error}</p>
          ) : short > 0 ? (
            <p className="field-hint text-[#B9770E]">{formatNumber(short)} unused sticker slot(s) will be returned to sponsors.</p>
          ) : (
            <p className="field-hint">Sponsored stickers are counted first, then the donor’s own.</p>
          )}
        </div>
        <Link to={`/print/stickers/${task?.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          <Icon name="file" size={12} /> Open sticker sheet
        </Link>
      </form>
    </Modal>
  );
}

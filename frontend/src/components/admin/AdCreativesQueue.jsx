import { useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import SegmentedControl from '../common/SegmentedControl';
import { SkeletonRows } from '../common/Skeleton';
import StickerPreview from '../ads/StickerPreview';
import { CreativeStatusBadge } from '../ads/AdBadges';
import useFetch from '../../hooks/useFetch';
import { adminApi, asList, errorMessage } from '../../services/api';
import { formatDateTime } from '../../utils/formatters';

const FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

/** Admin review queue for ad creatives: approve, or reject with a reason. */
export default function AdCreativesQueue({ onReviewed }) {
  const [status, setStatus] = useState('pending');
  const q = useFetch(() => adminApi.adCreatives(status), [status], { pollMs: 60000 });
  const list = asList(q.data, 'creatives');
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [reasonErr, setReasonErr] = useState('');

  const review = async (c, approved, why) => {
    setBusyId(c.id);
    try {
      await adminApi.reviewCreative(c.id, approved, why);
      toast.success(approved ? `“${c.title}” approved` : `“${c.title}” rejected`);
      q.setData((d) => asList(d, 'creatives').filter((x) => x.id !== c.id));
      onReviewed?.();
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'Review failed'));
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitReject = async () => {
    if (reason.trim().length < 3) {
      setReasonErr('Give the advertiser a short reason');
      return;
    }
    if (await review(rejecting, false, reason.trim())) setRejecting(null);
  };

  return (
    <div>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
        <SegmentedControl size="sm" ariaLabel="Filter creatives" options={FILTERS} value={status} onChange={setStatus} />
      </div>
      {q.loading ? (
        <SkeletonRows rows={3} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !list.length ? (
        <EmptyState icon="check-all" title={status === 'pending' ? 'Queue is empty' : 'Nothing here'} description={status === 'pending' ? 'All creatives have been reviewed.' : undefined} />
      ) : (
        <ul className="grid gap-4 p-4 sm:px-6 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-dark">{c.owner_name || 'Advertiser'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(c.created_at)}</p>
                </div>
                <CreativeStatusBadge status={c.status} />
              </div>
              <StickerPreview creative={c} sponsor={c.owner_name} />
              {c.url ? (
                <a href={c.url} target="_blank" rel="noreferrer noopener" className="truncate text-xs font-semibold text-primary hover:underline">
                  <Icon name="external" size={11} /> {c.url}
                </a>
              ) : null}
              {c.rejection_reason ? <p className="rounded-lg bg-critical-light px-3 py-2 text-xs text-critical">{c.rejection_reason}</p> : null}
              {c.status === 'pending' ? (
                <div className="mt-auto flex gap-2">
                  <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => review(c, true)} disabled={busyId === c.id}>
                    {busyId === c.id ? <Spinner size={12} /> : <Icon name="check" size={14} />} Approve
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex-1 text-critical"
                    onClick={() => {
                      setRejecting(c);
                      setReason('');
                      setReasonErr('');
                    }}
                    disabled={busyId === c.id}
                  >
                    <Icon name="x" size={14} /> Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        size="sm"
        title="Reject creative"
        description={rejecting?.title}
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setRejecting(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-danger" onClick={submitReject} disabled={busyId === rejecting?.id}>
              {busyId === rejecting?.id ? <Spinner size={16} /> : <Icon name="x-circle" size={16} />} Reject
            </button>
          </>
        }
      >
        <label className="label" htmlFor="reject-reason">
          Reason <span className="text-critical">*</span>
        </label>
        <textarea
          id="reject-reason"
          rows={3}
          maxLength={300}
          className={`input ${reasonErr ? 'input-error' : ''}`}
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonErr('');
          }}
          placeholder="e.g. Image is blurry, or the text is misleading"
        />
        {reasonErr ? <p className="field-error">{reasonErr}</p> : <p className="field-hint">The advertiser is notified with this reason.</p>}
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import SectionCard from '../common/SectionCard';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonCard } from '../common/Skeleton';
import { adMarketApi, asList, errorMessage } from '../../services/api';
import { formatDate } from '../../utils/formatters';
import CreativeUploadForm from './CreativeUploadForm';
import StickerPreview from './StickerPreview';
import { CreativeStatusBadge } from './AdBadges';

/** Creatives tab: upload + own creatives with review status. */
export default function CreativesPanel({ creativesQ, onUseCreative }) {
  const [toDelete, setToDelete] = useState(null);
  const creatives = asList(creativesQ.data, 'creatives');

  const remove = async () => {
    try {
      await adMarketApi.deleteCreative(toDelete.id);
      toast.success('Creative deleted');
      creativesQ.setData((d) => asList(d, 'creatives').filter((c) => c.id !== toDelete.id));
    } catch (err) {
      toast.error(errorMessage(err, 'Could not delete this creative'));
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      <SectionCard id="upload-creative" title="New creative" subtitle="One design for stickers, posters and digital banners" icon="upload" bodyClassName="card-pad">
        <CreativeUploadForm onCreated={() => creativesQ.reload()} />
      </SectionCard>

      <SectionCard id="my-creatives" title="My creatives" subtitle="Creatives are reviewed by our team before use" icon="sparkles" bodyClassName="card-pad">
        {creativesQ.loading ? (
          <div className="grid gap-4 md:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : creativesQ.error && !creativesQ.data ? (
          <ErrorState error={creativesQ.error} onRetry={creativesQ.reload} />
        ) : !creatives.length ? (
          <EmptyState icon="sparkles" title="No creatives yet" description="Upload your logo and tagline above. Approval usually takes less than a day." />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {creatives.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-2">
                  <CreativeStatusBadge status={c.status} />
                  <span className="text-xs text-slate-400">{formatDate(c.created_at, { year: 'numeric' })}</span>
                </div>
                <StickerPreview creative={c} />
                {c.status === 'rejected' && c.rejection_reason ? (
                  <p className="rounded-lg bg-critical-light px-3 py-2 text-xs text-critical">
                    <strong>Reason:</strong> {c.rejection_reason}
                  </p>
                ) : null}
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noreferrer" className="truncate text-xs font-semibold text-primary hover:underline">
                    <Icon name="external" size={11} /> {c.url}
                  </a>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2">
                  {c.status === 'approved' && onUseCreative ? (
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onUseCreative(c)}>
                      <Icon name="zap" size={14} /> Start campaign
                    </button>
                  ) : null}
                  <button type="button" className="btn btn-ghost btn-sm text-critical hover:bg-critical-light" onClick={() => setToDelete(c)}>
                    <Icon name="trash" size={14} /> Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        title="Delete this creative?"
        confirmLabel="Delete"
        message={
          <>
            <strong className="text-dark">{toDelete?.title}</strong> will be removed. Creatives used by an active campaign cannot be deleted.
          </>
        }
      />
    </div>
  );
}

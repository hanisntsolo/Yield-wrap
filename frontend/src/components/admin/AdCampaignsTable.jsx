import { useState } from 'react';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import SegmentedControl from '../common/SegmentedControl';
import { SkeletonRows } from '../common/Skeleton';
import { CampaignRow } from '../ads/CampaignList';
import useFetch from '../../hooks/useFetch';
import { adMarketApi, asList } from '../../services/api';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'packet', label: 'Packets' },
  { value: 'ngo_poster', label: 'Posters' },
  { value: 'digital', label: 'Digital' },
];

/** Every campaign on the platform (admins get all from GET /api/ads/campaigns). */
export default function AdCampaignsTable() {
  const [type, setType] = useState('');
  const q = useFetch(() => adMarketApi.campaigns(), [], { pollMs: 60000 });
  const list = asList(q.data, 'campaigns').filter((c) => !type || c.type === type);
  return (
    <div>
      <div className="border-b border-slate-100 px-4 py-3 sm:px-6">
        <SegmentedControl size="sm" ariaLabel="Filter campaigns" options={FILTERS} value={type} onChange={setType} />
      </div>
      {q.loading ? (
        <SkeletonRows rows={4} />
      ) : q.error && !q.data ? (
        <ErrorState error={q.error} onRetry={q.reload} />
      ) : !list.length ? (
        <EmptyState icon="megaphone" title="No campaigns" />
      ) : (
        <ul className="max-h-[640px] divide-y divide-slate-100 overflow-y-auto">
          {list.map((c) => (
            <CampaignRow key={c.id} c={c} showOwner />
          ))}
        </ul>
      )}
    </div>
  );
}

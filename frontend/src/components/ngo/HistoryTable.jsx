import { useState } from 'react';
import toast from 'react-hot-toast';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import { SkeletonRows } from '../common/Skeleton';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import useFetch from '../../hooks/useFetch';
import { asList, errorMessage, getApiError, ngoApi } from '../../services/api';
import { donationTotalKg, formatDateTime, formatKg, summarizeItems } from '../../utils/formatters';

/** Fetch the CSV through axios (so cookies are sent) and trigger a browser download. */
export function useCsvDownload() {
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const res = await ngoApi.historyCsv();
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: 'text/csv' });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
      const filename = match ? decodeURIComponent(match[1]) : `yieldwrap-ngo-history-${new Date().toISOString().slice(0, 10)}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('CSV downloaded');
    } catch (err) {
      // Error bodies arrive as Blobs when responseType is 'blob'.
      let msg = errorMessage(err, 'Could not download CSV');
      if (err?.response?.data instanceof Blob) {
        try {
          const json = JSON.parse(await err.response.data.text());
          msg = json?.error || msg;
        } catch {
          msg = getApiError(err).error;
        }
      }
      toast.error(msg);
    } finally {
      setDownloading(false);
    }
  };
  return { download, downloading };
}

export function CsvButton() {
  const { download, downloading } = useCsvDownload();
  return (
    <button type="button" className="btn btn-secondary btn-sm" onClick={download} disabled={downloading}>
      {downloading ? <Spinner size={14} /> : <Icon name="download" size={14} />} Download CSV
    </button>
  );
}

export default function HistoryTable() {
  const { data, loading, error, reload } = useFetch(() => ngoApi.history(), []);
  const rows = asList(data, 'donations');
  if (loading) return <SkeletonRows rows={4} />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!rows.length) return <EmptyState icon="calendar" title="No deliveries received yet" description="Completed deliveries will be listed here." />;
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead className="bg-slate-50/80">
          <tr>
            <th scope="col">Delivered</th>
            <th scope="col">Food</th>
            <th scope="col">Qty</th>
            <th scope="col">Donor</th>
            <th scope="col">Volunteer</th>
            <th scope="col">Received by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((d) => (
            <tr key={d.id}>
              <td className="whitespace-nowrap text-xs">{formatDateTime(d.delivered_at || d.delivery_record?.delivered_at)}</td>
              <td className="max-w-[14rem] truncate font-medium text-dark">{summarizeItems(d.food_items)}</td>
              <td className="whitespace-nowrap font-mono">
                {formatKg(d.delivery_record?.quantity_confirmed_kg ?? donationTotalKg(d))}
              </td>
              <td className="max-w-[10rem] truncate">{d.donor_name || '—'}</td>
              <td className="max-w-[10rem] truncate">{d.assigned_volunteer_name || '—'}</td>
              <td className="max-w-[10rem] truncate">{d.delivery_record?.receiver_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

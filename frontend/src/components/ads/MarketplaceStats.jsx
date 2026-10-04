import StatCard from '../common/StatCard';
import { formatNumber } from '../../utils/formatters';

/** Marketplace stats from GET /api/ads/inventory. */
export default function MarketplaceStats({ inventoryQ }) {
  const d = inventoryQ?.data || {};
  const loading = inventoryQ?.loading;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Open sticker slots" value={formatNumber(d.open_pool_packets)} icon="package" loading={loading} hint="Sponsored packets waiting" />
      <StatCard label="Stickered (30 d)" value={formatNumber(d.packets_stickered_30d)} icon="check-circle" tone="blue" loading={loading} />
      <StatCard label="Active packet campaigns" value={formatNumber(d.active_packet_campaigns)} icon="zap" tone="accent" loading={loading} />
      <StatCard label="Pending demand" value={formatNumber(d.pending_packet_demand)} icon="target" tone="purple" loading={loading} hint="Packets advertisers still want" />
    </div>
  );
}

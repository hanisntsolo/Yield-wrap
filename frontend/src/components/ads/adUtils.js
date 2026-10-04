import { apiUrl, getApiError } from '../../services/api';

export const CAMPAIGN_TYPES = [
  { value: 'packet', label: 'Packet stickers', icon: 'package', blurb: 'Your sticker on donated food packets, applied by volunteers at pickup.' },
  { value: 'ngo_poster', label: 'NGO poster', icon: 'building', blurb: 'A poster at an NGO kitchen or shelter, booked by the week.' },
  { value: 'digital', label: 'Digital', icon: 'megaphone', blurb: 'Banner impressions across the YIELD WRAP platform.' },
];
export const CAMPAIGN_TYPE_META = Object.fromEntries(CAMPAIGN_TYPES.map((t) => [t.value, t]));

export const TX_META = {
  purchase: { label: 'Purchase', tone: 'text-primary', icon: 'plus' },
  spend: { label: 'Spend', tone: 'text-critical', icon: 'minus' },
  refund: { label: 'Refund', tone: 'text-[#21618C]', icon: 'refresh' },
  earning: { label: 'Earning', tone: 'text-primary', icon: 'heart' },
  grant: { label: 'Grant', tone: 'text-[#76448A]', icon: 'sparkles' },
};

export const DEFAULT_PRICING = {
  credit_value_inr: 5,
  own_share: 0.5,
  ngo_revenue_share: 0.3,
  costs: { packet_sticker: 2, ngo_poster_week_default: 50, digital_per_1000: 10 },
  packs: [],
  payments: { provider: 'simulated', key_id: null },
};

/** Merge the backend pricing over defaults so the UI never crashes on a partial payload. */
export function normalizePricing(p) {
  return {
    ...DEFAULT_PRICING,
    ...(p || {}),
    costs: { ...DEFAULT_PRICING.costs, ...(p?.costs || {}) },
    packs: Array.isArray(p?.packs) ? p.packs : [],
    payments: { ...DEFAULT_PRICING.payments, ...(p?.payments || {}) },
  };
}

export const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const creditsToInr = (credits, pricing) => num(credits) * num(pricing?.credit_value_inr, 5);

/** Own-ad / sponsored split for N packets (mirrors the backend's floor(N × own_share)). */
export function packetSplit(packets, ownShare = 0.5, withOwnAd = true) {
  const n = Math.max(0, Math.floor(num(packets)));
  const own = withOwnAd ? Math.floor(n * num(ownShare, 0.5)) : 0;
  return { total: n, own, sponsored: n - own };
}

/** Credit cost of a campaign draft. */
export function campaignCost(type, draft, pricing, space) {
  const c = pricing?.costs || DEFAULT_PRICING.costs;
  if (type === 'packet') return Math.max(0, Math.floor(num(draft?.packets))) * num(c.packet_sticker, 2);
  if (type === 'ngo_poster') return Math.max(0, Math.floor(num(draft?.weeks))) * num(space?.credits_per_week, c.ngo_poster_week_default);
  if (type === 'digital') return (Math.max(0, num(draft?.impressions)) / 1000) * num(c.digital_per_1000, 10);
  return 0;
}

export const creativeImage = (creative) => (creative?.image_url ? apiUrl(creative.image_url) : '');

export const isInsufficientCredits = (err) => {
  const e = getApiError(err);
  return e.status === 402 || e.code === 'INSUFFICIENT_CREDITS';
};

/** 0..100 progress for a campaign plus a text label. */
export function campaignProgress(c) {
  if (c?.type === 'packet') {
    const req = num(c.packet?.packets_requested);
    const applied = num(c.packet?.packets_applied);
    return { pct: req ? (applied / req) * 100 : 0, label: `${applied} / ${req} packets stickered`, sub: `${num(c.packet?.packets_allocated)} allocated` };
  }
  if (c?.type === 'digital') {
    const bought = num(c.digital?.impressions_purchased);
    const served = num(c.digital?.impressions_served);
    return { pct: bought ? (served / bought) * 100 : 0, label: `${served} / ${bought} impressions`, sub: `${num(c.digital?.clicks)} clicks` };
  }
  if (c?.type === 'ngo_poster') {
    const s = c.poster?.booking_status;
    return { pct: s === 'displayed' ? 100 : s === 'declined' ? 0 : 15, label: `${c.poster?.space_name || 'Ad space'} · ${c.poster?.ngo_name || 'NGO'}`, sub: `${num(c.poster?.weeks)} week(s)` };
  }
  return { pct: 0, label: '', sub: '' };
}

/** Estimate of what cancelling would refund (backend is authoritative). */
export function estimateRefund(c, pricing) {
  const costs = pricing?.costs || DEFAULT_PRICING.costs;
  if (c?.type === 'packet') return Math.max(0, num(c.packet?.packets_requested) - num(c.packet?.packets_allocated)) * num(costs.packet_sticker, 2);
  if (c?.type === 'digital') return Math.floor(Math.max(0, num(c.digital?.impressions_purchased) - num(c.digital?.impressions_served)) / 1000 * num(costs.digital_per_1000, 10));
  if (c?.type === 'ngo_poster') return c.poster?.booking_status === 'displayed' ? 0 : num(c.credits_spent);
  return 0;
}

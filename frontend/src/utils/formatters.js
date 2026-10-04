// Display formatters. Every function tolerates null/undefined/garbage and returns a dash or sensible fallback.

const DASH = '—';

const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Parse an ISO string (UTC assumed when no offset is present), Date or epoch into a Date, or null. */
export function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  let s = String(value).trim();
  // Backend datetimes are UTC; naive ISO strings get a Z so browsers don't treat them as local time.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(s)) s += 'Z';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatNumber(value, { decimals = 0, compact = false } = {}) {
  if (!isNum(value)) return DASH;
  const n = Number(value);
  return new Intl.NumberFormat(undefined, {
    notation: compact && Math.abs(n) >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(n);
}

/** Indian rupees, e.g. "₹1,999" (paise shown only when present). */
export function formatINR(value, { decimals } = {}) {
  if (!isNum(value)) return DASH;
  const n = Number(value);
  const frac = decimals ?? (Number.isInteger(n) ? 0 : 2);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: frac,
    minimumFractionDigits: frac,
  }).format(n);
}

export function formatKg(value, { decimals } = {}) {
  if (!isNum(value)) return DASH;
  const n = Number(value);
  if (Math.abs(n) >= 1000) return `${formatNumber(n / 1000, { decimals: decimals ?? 1 })} t`;
  return `${formatNumber(n, { decimals: decimals ?? (n < 10 ? 1 : 0) })} kg`;
}

export function formatPercent(value, { decimals = 0, fraction } = {}) {
  if (!isNum(value)) return DASH;
  let n = Number(value);
  // Accept 0..1 fractions as well as 0..100 percentages.
  if (fraction === true || (fraction === undefined && Math.abs(n) <= 1 && n !== 0)) n *= 100;
  return `${formatNumber(n, { decimals })}%`;
}

/** Normalise a score that may be 0..1 or 0..100 into 0..100. */
export function toPercentScore(value) {
  if (!isNum(value)) return null;
  const n = Number(value);
  const pct = n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, pct));
}

export function formatDistance(km) {
  if (!isNum(km)) return DASH;
  const n = Number(km);
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${formatNumber(n, { decimals: n < 10 ? 1 : 0 })} km`;
}

export function formatDuration(minutes) {
  if (!isNum(minutes)) return DASH;
  const total = Math.max(0, Math.round(Number(minutes)));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${d}d ${h % 24}h`;
  }
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatEta(minutes) {
  if (!isNum(minutes)) return DASH;
  const n = Number(minutes);
  if (n <= 1) return 'Arriving';
  return `~${formatDuration(n)}`;
}

/** ETA expressed as a clock time ("by 14:35"). */
export function formatEtaClock(minutes) {
  if (!isNum(minutes)) return DASH;
  const d = new Date(Date.now() + Number(minutes) * 60000);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatDateTime(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return DASH;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

export function formatDate(value, opts = {}) {
  const d = parseDate(value);
  if (!d) return DASH;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...opts });
}

export function formatTime(value) {
  const d = parseDate(value);
  if (!d) return DASH;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function formatRelativeTime(value, now = Date.now()) {
  const d = parseDate(value);
  if (!d) return DASH;
  const diffSec = Math.round((d.getTime() - now) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(d, { year: 'numeric' });
}

/** Milliseconds until a target date (negative when past), or null. */
export function msUntil(value, now = Date.now()) {
  const d = parseDate(value);
  return d ? d.getTime() - now : null;
}

/** "2h 05m", "12m 30s", "Expired". */
export function formatCountdown(msLeft) {
  if (msLeft === null || msLeft === undefined || Number.isNaN(msLeft)) return DASH;
  if (msLeft <= 0) return 'Expired';
  const totalSec = Math.floor(msLeft / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${pad(m)}m`;
  return `${m}m ${pad(s)}s`;
}

/** Date -> value for <input type="datetime-local"> in the user's local time. */
export function toDatetimeLocal(value) {
  const d = parseDate(value);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** <input type="datetime-local"> value (local time) -> ISO-8601 UTC string. */
export function fromDatetimeLocal(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function titleCase(value) {
  if (!value) return '';
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name) {
  if (!name) return '?';
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

/** "Rice (12 kg) + 2 more" summary of a donation's food items. */
export function summarizeItems(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return 'Food donation';
  const first = list[0]?.name || 'Food';
  return list.length > 1 ? `${first} + ${list.length - 1} more` : first;
}

export function donationTotalKg(donation) {
  if (isNum(donation?.total_kg)) return Number(donation.total_kg);
  const items = Array.isArray(donation?.food_items) ? donation.food_items : [];
  return items.reduce((sum, it) => sum + (Number(it?.quantity_kg) || 0), 0);
}

export function donationEarliestExpiry(donation) {
  if (donation?.earliest_expiry) return donation.earliest_expiry;
  const items = Array.isArray(donation?.food_items) ? donation.food_items : [];
  const times = items.map((it) => parseDate(it?.expiry_time)).filter(Boolean);
  if (!times.length) return null;
  return new Date(Math.min(...times.map((t) => t.getTime()))).toISOString();
}

export function donationCategories(donation) {
  const items = Array.isArray(donation?.food_items) ? donation.food_items : [];
  return [...new Set(items.map((it) => it?.category).filter(Boolean))];
}

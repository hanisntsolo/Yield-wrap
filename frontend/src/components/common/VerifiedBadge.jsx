import { useEffect, useState } from 'react';
import { adsApi, asList } from '../../services/api';
import Icon from './Icon';

// Premium partners list is fetched once per page load and shared by every badge.
let partnersPromise = null;
function loadPartners() {
  if (!partnersPromise) {
    partnersPromise = adsApi
      .partners()
      .then((res) => asList(res, 'partners'))
      .catch(() => {
        partnersPromise = null;
        return [];
      });
  }
  return partnersPromise;
}

export function usePartners() {
  const [partners, setPartners] = useState([]);
  useEffect(() => {
    let active = true;
    loadPartners().then((list) => active && setPartners(list));
    return () => {
      active = false;
    };
  }, []);
  return partners;
}

const norm = (s) => String(s || '').trim().toLowerCase();

/** True when the given ids/name belong to a verified premium partner. */
export function isPartner(partners, { ids = [], name } = {}) {
  const idSet = new Set(ids.filter(Boolean).map(String));
  return partners.some((p) => idSet.has(String(p?.user_id)) || (name && norm(p?.name) === norm(name)));
}

export default function VerifiedBadge({ label = 'Verified Partner', size = 'sm', className = '' }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-[#22965C] font-semibold text-white shadow-sm ${
        size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      } ${className}`}
      title="Verified premium partner of YIELD WRAP"
    >
      <Icon name="shield" size={size === 'xs' ? 10 : 12} strokeWidth={2.2} />
      {label}
    </span>
  );
}

/** Renders a name and appends the Verified Partner badge if it matches a premium partner. */
export function PartnerName({ name, ids = [], premium, className = '' }) {
  const partners = usePartners();
  const show = premium || isPartner(partners, { ids, name });
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="truncate">{name || '—'}</span>
      {show && name ? <VerifiedBadge size="xs" /> : null}
    </span>
  );
}

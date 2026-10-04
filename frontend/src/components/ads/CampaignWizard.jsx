import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import EmptyState from '../common/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { adMarketApi, errorMessage, fieldErrors } from '../../services/api';
import { formatINR, formatNumber } from '../../utils/formatters';
import { toLatLng } from '../../utils/geo';
import { CAMPAIGN_TYPES, CAMPAIGN_TYPE_META, campaignCost, creditsToInr, isInsufficientCredits, num } from './adUtils';
import { Credits, toastInsufficientCredits } from './AdBadges';
import { DigitalFields, PacketFields } from './CampaignFields';
import PosterSpacePicker from './PosterSpacePicker';
import StickerPreview from './StickerPreview';

const STEPS = ['Type & creative', 'Details', 'Review'];
const INITIAL = { packets: 100, targeted: false, target: { address: '', lat: null, lng: null }, radius_km: 10, space: null, weeks: 2, impressions: 5000 };

function validateDetails(type, d) {
  const e = {};
  if (type === 'packet') {
    const n = Number(d.packets);
    if (!Number.isInteger(n) || n < 1 || n > 100000) e.packets = 'Enter 1–100,000 packets';
    if (d.targeted && !toLatLng(d.target)) e.target = 'Pick a location from the suggestions';
  }
  if (type === 'ngo_poster') {
    if (!d.space) e.space = 'Choose an ad space';
    const w = Number(d.weeks);
    if (!Number.isInteger(w) || w < 1 || w > 12) e.weeks = 'Enter 1–12 weeks';
  }
  if (type === 'digital') {
    const n = Number(d.impressions);
    if (!Number.isInteger(n) || n < 1000 || n > 1000000 || n % 1000) e.impressions = 'Use a multiple of 1,000 between 1,000 and 1,000,000';
  }
  return e;
}

function buildBody(type, creativeId, d) {
  if (type === 'packet') {
    const t = d.targeted ? toLatLng(d.target) : null;
    return { type, creative_id: creativeId, packets: Number(d.packets), ...(t ? { target: { ...t, radius_km: Number(d.radius_km) } } : {}) };
  }
  if (type === 'ngo_poster') return { type, creative_id: creativeId, ad_space_id: d.space?.id, weeks: Number(d.weeks) };
  return { type, creative_id: creativeId, impressions: Number(d.impressions) };
}

/** Three-step campaign builder with live cost vs balance. */
export default function CampaignWizard({ pricing, balance, creatives = [], inventory, initialCreativeId, onCreated, onBuyCredits }) {
  const { user } = useAuth();
  const approved = useMemo(() => creatives.filter((c) => c.status === 'approved'), [creatives]);
  const [step, setStep] = useState(0);
  const [type, setType] = useState('packet');
  const [creativeId, setCreativeId] = useState(initialCreativeId || '');
  const [draft, setDraft] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialCreativeId) setCreativeId(initialCreativeId);
  }, [initialCreativeId]);
  useEffect(() => {
    if (!creativeId && approved[0]) setCreativeId(approved[0].id);
  }, [approved, creativeId]);

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };
  const creative = approved.find((c) => c.id === creativeId);
  const cost = campaignCost(type, draft, pricing, draft.space);
  const short = Math.max(0, cost - num(balance));

  if (!approved.length) {
    return (
      <EmptyState
        icon="sparkles"
        title="You need an approved creative first"
        description="Upload your design under Creatives. Once approved you can use it for stickers, posters and digital ads."
        action={
          <Link to="?tab=creatives" className="btn btn-primary btn-sm">
            <Icon name="upload" size={14} /> Upload a creative
          </Link>
        }
      />
    );
  }

  const next = () => {
    if (step === 0 && !creative) {
      setErrors({ creative: 'Choose an approved creative' });
      return;
    }
    if (step === 1) {
      const e = validateDetails(type, draft);
      setErrors(e);
      if (Object.keys(e).length) {
        toast.error('Please fix the highlighted fields');
        return;
      }
    }
    setStep((s) => Math.min(2, s + 1));
  };

  const submit = async () => {
    if (short > 0) {
      toastInsufficientCredits(onBuyCredits, `You need ${formatNumber(short)} more credits.`);
      return;
    }
    setBusy(true);
    try {
      const campaign = await adMarketApi.createCampaign(buildBody(type, creativeId, draft));
      toast.success(`${CAMPAIGN_TYPE_META[type]?.label} campaign launched · ${formatNumber(cost)} credits spent`);
      setDraft(INITIAL);
      setStep(0);
      onCreated?.(campaign);
    } catch (err) {
      if (isInsufficientCredits(err)) toastInsufficientCredits(onBuyCredits, errorMessage(err, 'Not enough credits for this campaign.'));
      else {
        setErrors(fieldErrors(err));
        toast.error(errorMessage(err, 'Could not create the campaign'));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${i === step ? 'bg-primary text-white' : i < step ? 'bg-primary-light text-primary' : 'bg-slate-100 text-slate-500'}`} aria-current={i === step ? 'step' : undefined}>
            <span className="font-mono">{i + 1}</span> {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label="Campaign type">
            {CAMPAIGN_TYPES.map((t) => {
              const on = t.value === type;
              return (
                <button key={t.value} type="button" role="radio" aria-checked={on} onClick={() => setType(t.value)} className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-4 text-left transition-all ${on ? 'border-primary bg-primary-light' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                    <Icon name={t.icon} size={18} />
                  </span>
                  <span className="text-sm font-bold text-dark">{t.label}</span>
                  <span className="text-xs text-slate-500">{t.blurb}</span>
                </button>
              );
            })}
          </div>
          <div>
            <label className="label" htmlFor="cmp-creative">
              Creative <span className="text-critical">*</span>
            </label>
            <select id="cmp-creative" className={`input ${errors.creative ? 'input-error' : ''}`} value={creativeId} onChange={(e) => setCreativeId(e.target.value)}>
              {approved.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            {errors.creative ? <p className="field-error">{errors.creative}</p> : null}
          </div>
          {creative ? <StickerPreview creative={creative} sponsor={user?.name} /> : null}
        </div>
      ) : null}

      {step === 1 ? (
        <>
          {type === 'packet' ? <PacketFields draft={draft} set={set} errors={errors} pricing={pricing} inventory={inventory} /> : null}
          {type === 'ngo_poster' ? <PosterSpacePicker draft={draft} set={set} errors={errors} origin={user?.location} /> : null}
          {type === 'digital' ? <DigitalFields draft={draft} set={set} errors={errors} pricing={pricing} /> : null}
        </>
      ) : null}

      {step === 2 ? (
        <div className="grid gap-4 md:grid-cols-2">
          <StickerPreview creative={creative} sponsor={user?.name} />
          <dl className="grid grid-cols-2 gap-2 rounded-2xl bg-surface p-4 text-sm">
            <dt className="text-slate-500">Type</dt>
            <dd className="text-right font-semibold">{CAMPAIGN_TYPE_META[type]?.label}</dd>
            {type === 'packet' ? (
              <>
                <dt className="text-slate-500">Packets</dt>
                <dd className="metric text-right">{formatNumber(draft.packets)}</dd>
                <dt className="text-slate-500">Target</dt>
                <dd className="truncate text-right">{draft.targeted ? `${draft.radius_km} km around ${draft.target?.address || 'pin'}` : 'Anywhere'}</dd>
              </>
            ) : null}
            {type === 'ngo_poster' ? (
              <>
                <dt className="text-slate-500">Space</dt>
                <dd className="truncate text-right">{draft.space?.name} · {draft.space?.ngo_name}</dd>
                <dt className="text-slate-500">Weeks</dt>
                <dd className="metric text-right">{draft.weeks}</dd>
              </>
            ) : null}
            {type === 'digital' ? (
              <>
                <dt className="text-slate-500">Impressions</dt>
                <dd className="metric text-right">{formatNumber(draft.impressions)}</dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}

      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${short > 0 ? 'border-critical/40 bg-critical-light/50' : 'border-primary/30 bg-primary-light/50'}`}>
        <div className="text-sm">
          <p>
            Cost <Credits value={cost} className="text-lg text-dark" /> <span className="font-mono text-xs text-slate-500">({formatINR(creditsToInr(cost, pricing))})</span>
          </p>
          <p className="text-xs text-slate-600">
            Balance <Credits value={balance} />
            {short > 0 ? <span className="ml-1 font-semibold text-critical">· {formatNumber(short)} credits short</span> : null}
          </p>
        </div>
        {short > 0 ? (
          <button type="button" className="btn btn-accent btn-sm" onClick={onBuyCredits}>
            <Icon name="zap" size={14} /> Buy credits
          </button>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {step > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => setStep((s) => s - 1)} disabled={busy}>
            <Icon name="chevron-left" size={16} /> Back
          </button>
        ) : null}
        {step < 2 ? (
          <button type="button" className="btn btn-primary" onClick={next}>
            Next <Icon name="chevron-right" size={16} />
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy || short > 0 || cost <= 0}>
            {busy ? <Spinner size={16} /> : <Icon name="zap" size={16} />} Launch for {formatNumber(cost)} credits
          </button>
        )}
      </div>
    </div>
  );
}

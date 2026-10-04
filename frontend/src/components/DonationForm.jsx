import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi, asList, donorApi, errorMessage, fieldErrors } from '../services/api';
import { resolveLocation } from '../services/geocoding';
import { useAuth } from '../context/AuthContext';
import { COMMON_ALLERGENS, FOOD_CATEGORIES, URGENCY_LEVELS } from '../utils/constants';
import { fromDatetimeLocal, toDatetimeLocal } from '../utils/formatters';
import AddressInput from './common/AddressInput';
import ChipsInput from './common/ChipsInput';
import Icon from './common/Icon';
import SegmentedControl from './common/SegmentedControl';
import Spinner from './common/Spinner';
import MatchCard from './MatchCard';
import EmptyState from './common/EmptyState';
import PackagingFields from './ads/PackagingFields';

const NOTES_MAX = 500;
let keySeq = 0;
const nextKey = () => `item-${Date.now()}-${keySeq++}`;

function defaultExpiry(hours = 4) {
  const d = new Date(Date.now() + hours * 3600000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return toDatetimeLocal(d);
}

const blankItem = () => ({ key: nextKey(), name: '', category: 'cooked', quantity_kg: '', expiry_time: defaultExpiry(), allergens: [] });

const itemFromDonation = (it) => ({
  key: nextKey(),
  name: it?.name || '',
  category: it?.category || 'cooked',
  quantity_kg: it?.quantity_kg ?? '',
  expiry_time: toDatetimeLocal(it?.expiry_time) || defaultExpiry(),
  allergens: Array.isArray(it?.allergens) ? it.allergens : [],
});

/**
 * Quick Donate form. mode="create": creates the donation then asks the AI engine for ranked NGO matches.
 * mode="edit": updates a pending donation (PUT) and calls onSaved.
 */
export default function DonationForm({ mode = 'create', initial, onCreated, onSaved, onCancel }) {
  const { user } = useAuth();
  const isEdit = mode === 'edit';
  const [items, setItems] = useState(() =>
    initial?.food_items?.length ? initial.food_items.map(itemFromDonation) : [blankItem()],
  );
  const [pickup, setPickup] = useState(() => initial?.pickup_location || user?.location || { address: '', lat: null, lng: null });
  const [urgency, setUrgency] = useState(initial?.urgency_level || 'medium');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [packaging, setPackaging] = useState(() => {
    const ownId = initial?.packaging?.own_ad?.creative_id || initial?.own_ad_creative_id || '';
    const count = initial?.packet_count ?? initial?.packaging?.packet_count;
    return { packets: count ? String(count) : '', ownAd: Boolean(ownId), creativeId: ownId };
  });
  const [errors, setErrors] = useState({});
  const [stage, setStage] = useState('idle'); // idle | saving | matching | done
  const [result, setResult] = useState(null); // { donation, matches }

  const urgencyOptions = useMemo(
    () => URGENCY_LEVELS.map((u) => ({ value: u.value, label: u.label, activeClass: `${u.active} shadow-sm` })),
    [],
  );

  const updateItem = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const removeItem = (key) => setItems((list) => (list.length > 1 ? list.filter((it) => it.key !== key) : list));

  const validate = () => {
    const e = {};
    const now = Date.now();
    items.forEach((it, i) => {
      if (!it.name.trim()) e[`food_items.${i}.name`] = 'Name is required';
      const q = Number(it.quantity_kg);
      if (!it.quantity_kg || !Number.isFinite(q) || q <= 0) e[`food_items.${i}.quantity_kg`] = 'Enter a quantity above 0';
      else if (q > 100000) e[`food_items.${i}.quantity_kg`] = 'That looks too large';
      const exp = it.expiry_time ? new Date(it.expiry_time).getTime() : NaN;
      if (!Number.isFinite(exp)) e[`food_items.${i}.expiry_time`] = 'Expiry is required';
      else if (exp <= now) e[`food_items.${i}.expiry_time`] = 'Expiry must be in the future';
    });
    if (!pickup?.address?.trim()) e.pickup_location = 'Pickup address is required';
    const pc = packaging.packets === '' ? 0 : Number(packaging.packets);
    if (!Number.isInteger(pc) || pc < 0 || pc > 100000) e.packet_count = 'Enter 0–100,000 packets';
    else if (packaging.ownAd && pc > 0 && !packaging.creativeId) e.own_ad_creative_id = 'Choose a creative or turn the ad off';
    if (notes.length > NOTES_MAX) e.notes = `Keep notes under ${NOTES_MAX} characters`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const buildBody = (location) => {
    const body = {
      food_items: items.map((it) => ({
        name: it.name.trim(),
        category: it.category,
        quantity_kg: Number(it.quantity_kg),
        // Always a full ISO-8601 UTC string, never the naive datetime-local value.
        expiry_time: fromDatetimeLocal(it.expiry_time),
        allergens: it.allergens,
      })),
      pickup_location: { address: location.address, lat: location.lat, lng: location.lng },
      urgency_level: urgency,
    };
    const packets = packaging.packets === '' ? 0 : Number(packaging.packets);
    if (packets || isEdit) body.packet_count = packets;
    if (packets > 0 && packaging.ownAd && packaging.creativeId) body.own_ad_creative_id = packaging.creativeId;
    else if (isEdit) body.own_ad_creative_id = null;
    if (notes.trim() || isEdit) body.notes = notes.trim();
    return body;
  };

  const reset = () => {
    setItems([blankItem()]);
    setUrgency('medium');
    setNotes('');
    setPackaging({ packets: '', ownAd: false, creativeId: '' });
    setErrors({});
    setResult(null);
    setStage('idle');
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setStage('saving');
    const location = await resolveLocation(pickup);
    if (!location) {
      setErrors((e) => ({ ...e, pickup_location: 'We could not locate this address. Pick a suggestion or use your location.' }));
      toast.error('Pickup address could not be located');
      setStage('idle');
      return;
    }
    setPickup(location);

    let donation;
    try {
      donation = isEdit ? await donorApi.updateDonation(initial.id, buildBody(location)) : await donorApi.createDonation(buildBody(location));
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, isEdit ? 'Could not save the donation' : 'Could not create the donation'));
      setStage('idle');
      return;
    }

    if (isEdit) {
      toast.success('Donation updated');
      setStage('idle');
      onSaved?.(donation);
      return;
    }

    toast.success('Donation listed — finding the best NGO…');
    onCreated?.(donation);
    setStage('matching');
    try {
      const res = await aiApi.match(donation.id);
      const matches = asList(res?.matches);
      setResult({ donation: res?.donation || donation, matches });
      onCreated?.(res?.donation || donation);
      if (matches.length) toast.success(`Found ${matches.length} matching NGO${matches.length > 1 ? 's' : ''}`);
      else toast('No compatible NGO right now — it stays open for NGOs nearby.', { icon: <Icon name="info" size={18} className="text-[#21618C]" /> });
    } catch (err) {
      setResult({ donation, matches: [] });
      toast.error(errorMessage(err, 'Matching failed — your donation is still listed'));
    } finally {
      setStage('done');
    }
  };

  if (!isEdit && stage === 'done' && result) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-primary-light px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Icon name="sparkles" size={18} />
            AI ranked {result.matches.length} NGO{result.matches.length === 1 ? '' : 's'} for your donation
          </p>
          <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
            <Icon name="plus" size={14} /> List another donation
          </button>
        </div>
        {result.matches.length ? (
          <div className="grid gap-3">
            {result.matches.map((m, i) => (
              <MatchCard key={m.ngo_id || i} match={m} rank={i + 1} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon="building"
            title="No NGO matched yet"
            description="Your donation stays open. Compatible NGOs nearby can still claim it, and we will notify you when it is accepted."
          />
        )}
      </div>
    );
  }

  const busy = stage === 'saving' || stage === 'matching';
  const err = (k) => errors[k];

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <fieldset className="space-y-3" disabled={busy}>
        <legend className="mb-1 flex w-full items-center justify-between">
          <span className="text-sm font-semibold text-dark">Food items</span>
          <span className="text-xs text-slate-500">{items.length} item{items.length > 1 ? 's' : ''}</span>
        </legend>
        {items.map((it, i) => (
          <div key={it.key} className="relative rounded-2xl border border-slate-200 bg-surface/60 p-3 sm:p-4">
            {items.length > 1 ? (
              <button
                type="button"
                className="btn-icon absolute right-2 top-2 h-8 w-8 text-slate-400 hover:text-critical"
                onClick={() => removeItem(it.key)}
                aria-label={`Remove item ${i + 1}`}
              >
                <Icon name="trash" size={16} />
              </button>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
              <div className="sm:col-span-2 xl:col-span-4">
                <label className="label" htmlFor={`${it.key}-name`}>
                  Food name <span className="text-critical">*</span>
                </label>
                <input
                  id={`${it.key}-name`}
                  className={`input ${err(`food_items.${i}.name`) ? 'input-error' : ''}`}
                  placeholder="e.g. Vegetable biryani"
                  value={it.name}
                  onChange={(e) => updateItem(it.key, { name: e.target.value })}
                  maxLength={120}
                />
                {err(`food_items.${i}.name`) ? <p className="field-error">{err(`food_items.${i}.name`)}</p> : null}
              </div>
              <div className="xl:col-span-3">
                <label className="label" htmlFor={`${it.key}-cat`}>
                  Category
                </label>
                <select
                  id={`${it.key}-cat`}
                  className="input"
                  value={it.category}
                  onChange={(e) => updateItem(it.key, { category: e.target.value })}
                >
                  {FOOD_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="xl:col-span-2">
                <label className="label" htmlFor={`${it.key}-qty`}>
                  Quantity (kg) <span className="text-critical">*</span>
                </label>
                <input
                  id={`${it.key}-qty`}
                  type="number"
                  inputMode="decimal"
                  min="0.1"
                  step="0.1"
                  className={`input font-mono ${err(`food_items.${i}.quantity_kg`) ? 'input-error' : ''}`}
                  placeholder="0.0"
                  value={it.quantity_kg}
                  onChange={(e) => updateItem(it.key, { quantity_kg: e.target.value })}
                />
                {err(`food_items.${i}.quantity_kg`) ? <p className="field-error">{err(`food_items.${i}.quantity_kg`)}</p> : null}
              </div>
              <div className="sm:col-span-2 xl:col-span-3">
                <label className="label" htmlFor={`${it.key}-exp`}>
                  Best before <span className="text-critical">*</span>
                </label>
                <input
                  id={`${it.key}-exp`}
                  type="datetime-local"
                  className={`input ${err(`food_items.${i}.expiry_time`) ? 'input-error' : ''}`}
                  min={toDatetimeLocal(new Date())}
                  value={it.expiry_time}
                  onChange={(e) => updateItem(it.key, { expiry_time: e.target.value })}
                />
                {err(`food_items.${i}.expiry_time`) ? <p className="field-error">{err(`food_items.${i}.expiry_time`)}</p> : null}
              </div>
              <div className="sm:col-span-2 xl:col-span-12">
                <ChipsInput
                  id={`${it.key}-allergens`}
                  label="Allergens"
                  value={it.allergens}
                  onChange={(allergens) => updateItem(it.key, { allergens })}
                  placeholder="Type an allergen, then Enter or comma"
                  suggestions={COMMON_ALLERGENS}
                />
              </div>
            </div>
          </div>
        ))}
        <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setItems((l) => [...l, blankItem()])}>
          <Icon name="plus" size={14} /> Add another item
        </button>
      </fieldset>

      <fieldset disabled={busy} className="space-y-5">
        <AddressInput
          id="pickup-address"
          label="Pickup address"
          required
          value={pickup}
          onChange={setPickup}
          error={err('pickup_location') || err('pickup_location.address') || err('pickup_location.lat')}
          hint="Where should the volunteer collect the food?"
        />

        <div>
          <span className="label" id="urgency-label">
            Urgency
          </span>
          <SegmentedControl ariaLabel="Urgency" options={urgencyOptions} value={urgency} onChange={setUrgency} />
          {err('urgency_level') ? <p className="field-error">{err('urgency_level')}</p> : null}
        </div>

        <PackagingFields value={packaging} onChange={setPackaging} errors={errors} />

        <div>
          <label className="label" htmlFor="donation-notes">
            Notes for pickup <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            id="donation-notes"
            rows={2}
            maxLength={NOTES_MAX}
            className={`input resize-y ${err('notes') ? 'input-error' : ''}`}
            placeholder="e.g. Use the back entrance, ask for Priya at the kitchen."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <div className="mt-1 flex justify-between text-xs">
            <span className="text-critical">{err('notes')}</span>
            <span className={`font-mono ${notes.length > NOTES_MAX - 50 ? 'text-[#B9770E]' : 'text-slate-400'}`}>
              {notes.length}/{NOTES_MAX}
            </span>
          </div>
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? <Spinner size={18} /> : <Icon name={isEdit ? 'check' : 'sparkles'} size={18} />}
          {isEdit ? (busy ? 'Saving…' : 'Save changes') : stage === 'matching' ? 'Matching with NGOs…' : stage === 'saving' ? 'Listing donation…' : 'Find Match'}
        </button>
      </div>
    </form>
  );
}

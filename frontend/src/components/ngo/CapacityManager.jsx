import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import ProgressBar from '../common/ProgressBar';
import Spinner from '../common/Spinner';
import Icon from '../common/Icon';
import { errorMessage, fieldErrors, ngoApi } from '../../services/api';
import { formatKg, formatNumber } from '../../utils/formatters';

/** Slider for current load (0..capacity) + editable storage capacity, saved with PUT /api/ngo/capacity. */
export default function CapacityManager({ profile, onSaved }) {
  const sliderId = useId();
  const capId = useId();
  const serverLoad = Number(profile?.current_load_kg) || 0;
  const serverCap = Number(profile?.storage_capacity_kg) || 0;
  const [load, setLoad] = useState(serverLoad);
  const [capacity, setCapacity] = useState(serverCap ? String(serverCap) : '');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    setLoad(serverLoad);
    setCapacity(serverCap ? String(serverCap) : '');
  }, [serverLoad, serverCap]);

  const capNum = Number(capacity) || 0;
  const max = Math.max(capNum, 1);
  const clampedLoad = Math.min(load, capNum || load);
  const pct = capNum ? (clampedLoad / capNum) * 100 : 0;
  const dirty = Math.round(clampedLoad * 10) !== Math.round(serverLoad * 10) || capNum !== serverCap;
  const free = Math.max(0, capNum - clampedLoad);

  const save = async () => {
    if (!capNum || capNum <= 0) {
      setErrors({ storage_capacity_kg: 'Capacity must be greater than 0' });
      return;
    }
    setSaving(true);
    setErrors({});
    try {
      const body = { current_load_kg: Math.round(clampedLoad * 10) / 10 };
      if (capNum !== serverCap) body.storage_capacity_kg = capNum;
      const res = await ngoApi.updateCapacity(body);
      toast.success('Capacity updated');
      onSaved?.(res?.profile ?? res);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Could not update capacity'));
    } finally {
      setSaving(false);
    }
  };

  const tone = pct >= 90 ? 'text-critical' : pct >= 70 ? 'text-[#B9770E]' : 'text-primary';

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Utilisation</p>
          <p className={`metric text-3xl ${tone}`}>{formatNumber(pct)}%</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p>
            <span className="font-mono font-semibold text-dark">{formatKg(free)}</span> free
          </p>
          <p>of {formatKg(capNum)}</p>
        </div>
      </div>
      <ProgressBar value={pct} autoTone height="h-3" label="Storage utilisation" />

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor={sliderId} className="label mb-0">
            Current load
          </label>
          <span className="font-mono text-sm font-semibold text-dark">{formatKg(clampedLoad)}</span>
        </div>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={max}
          step={capNum > 200 ? 1 : 0.5}
          value={clampedLoad}
          onChange={(e) => setLoad(Number(e.target.value))}
          className="h-2 w-full cursor-pointer"
          disabled={!capNum}
          aria-valuetext={`${clampedLoad} kilograms`}
        />
        <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
          <span>0</span>
          <span>{formatKg(capNum)}</span>
        </div>
        {errors.current_load_kg ? <p className="field-error">{errors.current_load_kg}</p> : null}
      </div>

      <div>
        <label htmlFor={capId} className="label">
          Storage capacity (kg)
        </label>
        <input
          id={capId}
          type="number"
          min="1"
          step="1"
          inputMode="decimal"
          className={`input font-mono ${errors.storage_capacity_kg ? 'input-error' : ''}`}
          value={capacity}
          onChange={(e) => setCapacity(e.target.value)}
        />
        {errors.storage_capacity_kg ? <p className="field-error">{errors.storage_capacity_kg}</p> : null}
      </div>

      <div className="flex gap-2">
        <button type="button" className="btn btn-primary flex-1" onClick={save} disabled={!dirty || saving}>
          {saving ? <Spinner size={16} /> : <Icon name="check" size={16} />} Save capacity
        </button>
        {dirty ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setLoad(serverLoad);
              setCapacity(serverCap ? String(serverCap) : '');
            }}
            disabled={saving}
          >
            Reset
          </button>
        ) : null}
      </div>
    </div>
  );
}

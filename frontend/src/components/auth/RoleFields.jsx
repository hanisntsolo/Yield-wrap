import { useRef } from 'react';
import Icon from '../common/Icon';
import { ALLOWED_DOC_EXTENSIONS, ALLOWED_DOC_TYPES, BUSINESS_TYPES, FOOD_CATEGORIES, MAX_UPLOAD_BYTES, VEHICLE_TYPES } from '../../utils/constants';

export function Field({ id, label, required, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {required ? <span className="text-critical"> *</span> : null}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}

/** Validate an NGO registration document. Returns an error string or null. */
export function validateDocument(file) {
  if (!file) return null;
  const name = file.name?.toLowerCase() || '';
  const okType = ALLOWED_DOC_TYPES.includes(file.type) || ALLOWED_DOC_EXTENSIONS.some((ext) => name.endsWith(ext));
  if (!okType) return 'Upload a PDF, PNG or JPG file';
  if (file.size > MAX_UPLOAD_BYTES) return 'File must be 5 MB or smaller';
  return null;
}

export function DocumentPicker({ file, onChange, error }) {
  const inputRef = useRef(null);
  return (
    <div>
      <span className="label">Registration document</span>
      <div
        className={`flex flex-col items-start gap-3 rounded-xl border-2 border-dashed p-4 sm:flex-row sm:items-center ${
          error ? 'border-critical bg-critical-light/40' : 'border-slate-300 bg-surface'
        }`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm">
          <Icon name="file" />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          {file ? (
            <>
              <p className="truncate font-semibold text-dark">{file.name}</p>
              <p className="font-mono text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
            </>
          ) : (
            <p className="text-slate-600">PDF, PNG or JPG up to 5 MB. Speeds up verification.</p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
            <Icon name="upload" size={14} /> {file ? 'Replace' : 'Choose file'}
          </button>
          {file ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(null)} aria-label="Remove file">
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => {
            onChange(e.target.files?.[0] || null);
            e.target.value = '';
          }}
        />
      </div>
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

export function NgoFields({ form, set, errors, docFile, setDocFile }) {
  const types = form.accepted_food_types || [];
  const toggle = (v) => set('accepted_food_types', types.includes(v) ? types.filter((t) => t !== v) : [...types, v]);
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-dark">
        <Icon name="building" size={16} className="text-primary" /> Organisation details
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="org-name" label="Organisation name" required error={errors.organization_name}>
          <input id="org-name" className={`input ${errors.organization_name ? 'input-error' : ''}`} value={form.organization_name} onChange={(e) => set('organization_name', e.target.value)} />
        </Field>
        <Field id="reg-no" label="Registration number" required error={errors.registration_number}>
          <input id="reg-no" className={`input font-mono ${errors.registration_number ? 'input-error' : ''}`} value={form.registration_number} onChange={(e) => set('registration_number', e.target.value)} />
        </Field>
        <Field id="capacity" label="Storage capacity (kg)" required error={errors.storage_capacity_kg}>
          <input id="capacity" type="number" min="1" inputMode="decimal" className={`input font-mono ${errors.storage_capacity_kg ? 'input-error' : ''}`} value={form.storage_capacity_kg} onChange={(e) => set('storage_capacity_kg', e.target.value)} />
        </Field>
        <Field id="beneficiaries" label="Beneficiaries served" error={errors.beneficiary_count} hint="Approximate people you feed per day">
          <input id="beneficiaries" type="number" min="0" inputMode="numeric" className={`input font-mono ${errors.beneficiary_count ? 'input-error' : ''}`} value={form.beneficiary_count} onChange={(e) => set('beneficiary_count', e.target.value)} />
        </Field>
      </div>
      <div>
        <span className="label">
          Accepted food types <span className="text-critical">*</span>
        </span>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Accepted food types">
          {FOOD_CATEGORIES.map((c) => {
            const on = types.includes(c.value);
            return (
              <button key={c.value} type="button" aria-pressed={on} onClick={() => toggle(c.value)} className={`chip ${on ? 'chip-on' : 'chip-off'}`}>
                {on ? <Icon name="check" size={14} strokeWidth={2.6} /> : null}
                {c.label}
              </button>
            );
          })}
        </div>
        {errors.accepted_food_types ? <p className="field-error">{errors.accepted_food_types}</p> : null}
      </div>
      <DocumentPicker file={docFile} onChange={setDocFile} error={errors.document} />
    </div>
  );
}

export function BusinessFields({ form, set, errors }) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-dark">
        <Icon name="megaphone" size={16} className="text-primary" /> Business details
      </h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="biz-name" label="Business name" required error={errors.business_name}>
          <input id="biz-name" className={`input ${errors.business_name ? 'input-error' : ''}`} value={form.business_name} onChange={(e) => set('business_name', e.target.value)} maxLength={150} />
        </Field>
        <Field id="biz-type" label="Business type" error={errors.business_type}>
          <select id="biz-type" className={`input ${errors.business_type ? 'input-error' : ''}`} value={form.business_type} onChange={(e) => set('business_type', e.target.value)}>
            {BUSINESS_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field id="biz-website" label="Website" error={errors.website} hint="Optional, e.g. https://example.com">
            <input id="biz-website" type="url" inputMode="url" className={`input ${errors.website ? 'input-error' : ''}`} value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" />
          </Field>
        </div>
      </div>
      <p className="text-xs text-slate-500">Business accounts are verified automatically. Buy ad credits to sponsor food packets, NGO posters and digital ads.</p>
    </div>
  );
}

export function VolunteerFields({ form, set, errors }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 sm:p-5">
      <span className="label">How will you deliver?</span>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Vehicle type">
        {VEHICLE_TYPES.map((v) => {
          const on = form.vehicle_type === v.value;
          return (
            <button key={v.value} type="button" role="radio" aria-checked={on} onClick={() => set('vehicle_type', v.value)} className={`chip justify-center ${on ? 'chip-on' : 'chip-off'}`}>
              {v.label}
            </button>
          );
        })}
      </div>
      {errors.vehicle_type ? <p className="field-error">{errors.vehicle_type}</p> : null}
    </div>
  );
}

export function AdminFields({ form, set, errors }) {
  return (
    <div className="rounded-2xl border border-accent/40 bg-accent-light/60 p-4 sm:p-5">
      <Field id="admin-code" label="Admin sign-up code" required error={errors.admin_code} hint="Provided by the platform operators.">
        <input id="admin-code" type="password" autoComplete="off" className={`input font-mono ${errors.admin_code ? 'input-error' : ''}`} value={form.admin_code} onChange={(e) => set('admin_code', e.target.value)} />
      </Field>
    </div>
  );
}

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import { Field } from '../auth/RoleFields';
import { errorMessage, fieldErrors, ngoAdsApi } from '../../services/api';

const blank = { name: '', description: '', size: 'A3 poster', credits_per_week: 50 };

/** Create / edit an NGO ad space. */
export default function AdSpaceFormModal({ open, space, onClose, onSaved }) {
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(space?.id);

  useEffect(() => {
    if (open) {
      setForm(space ? { name: space.name || '', description: space.description || '', size: space.size || '', credits_per_week: space.credits_per_week ?? 50 } : blank);
      setErrors({});
    }
  }, [open, space]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = {};
    if (form.name.trim().length < 2 || form.name.trim().length > 80) e.name = 'Name must be 2–80 characters';
    const c = Number(form.credits_per_week);
    if (!Number.isInteger(c) || c < 10 || c > 10000) e.credits_per_week = 'Between 10 and 10,000 credits';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const body = { name: form.name.trim(), description: form.description.trim(), size: form.size.trim(), credits_per_week: c };
    try {
      const saved = isEdit ? await ngoAdsApi.updateSpace(space.id, body) : await ngoAdsApi.createSpace(body);
      toast.success(isEdit ? 'Ad space updated' : 'Ad space listed. Advertisers nearby can now book it.');
      onSaved?.(saved);
      onClose?.();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Could not save the ad space'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      dismissible={!saving}
      title={isEdit ? 'Edit ad space' : 'New ad space'}
      description="A wall, notice board or counter where a sponsor's poster can hang. Location = your NGO address."
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="ad-space-form" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Icon name="check" size={16} />} {isEdit ? 'Save' : 'List space'}
          </button>
        </>
      }
    >
      <form id="ad-space-form" onSubmit={submit} noValidate className="space-y-4">
        <Field id="sp-name" label="Name" required error={errors.name}>
          <input id="sp-name" className={`input ${errors.name ? 'input-error' : ''}`} maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Dining hall entrance" />
        </Field>
        <Field id="sp-desc" label="Description" error={errors.description}>
          <textarea id="sp-desc" rows={2} className="input" value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Footfall, visibility, opening hours…" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="sp-size" label="Size" error={errors.size}>
            <input id="sp-size" className="input" value={form.size} onChange={(e) => set('size', e.target.value)} placeholder="A3 poster" />
          </Field>
          <Field id="sp-price" label="Credits per week" required error={errors.credits_per_week} hint="10–10,000">
            <input id="sp-price" type="number" min="10" max="10000" inputMode="numeric" className={`input font-mono ${errors.credits_per_week ? 'input-error' : ''}`} value={form.credits_per_week} onChange={(e) => set('credits_per_week', e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

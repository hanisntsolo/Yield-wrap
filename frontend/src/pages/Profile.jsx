import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import SectionCard from '../components/common/SectionCard';
import AddressInput from '../components/common/AddressInput';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import VerifiedBadge from '../components/common/VerifiedBadge';
import { DocumentPicker, Field, validateDocument } from '../components/auth/RoleFields';
import { apiUrl, authApi, errorMessage, fieldErrors } from '../services/api';
import { resolveLocation } from '../services/geocoding';
import { ROLE_LABELS, VEHICLE_LABELS } from '../utils/constants';
import { formatDate, initials } from '../utils/formatters';

function NgoDocument({ profile, onUploaded }) {
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null);

  const upload = async () => {
    const err = validateDocument(file);
    if (err || !file) {
      setError(err || 'Choose a file first');
      return;
    }
    setProgress(0);
    try {
      await authApi.uploadNgoDocument(file, (e) => e.total && setProgress(Math.round((e.loaded / e.total) * 100)));
      toast.success('Document uploaded — an admin will review it shortly');
      setFile(null);
      onUploaded?.();
    } catch (e) {
      toast.error(errorMessage(e, 'Upload failed'));
    } finally {
      setProgress(null);
    }
  };

  return (
    <SectionCard title="Verification document" subtitle={profile?.is_verified ? 'Your NGO is verified' : 'Required for NGO verification'} icon="shield" bodyClassName="card-pad space-y-4">
      {profile?.document_url ? (
        <a href={apiUrl(profile.document_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Icon name="file" size={16} /> View uploaded document <Icon name="external" size={14} />
        </a>
      ) : null}
      <DocumentPicker file={file} onChange={(f) => { setFile(f); setError(validateDocument(f)); }} error={error} />
      <button type="button" className="btn btn-primary" onClick={upload} disabled={!file || progress !== null}>
        {progress !== null ? <Spinner size={16} /> : <Icon name="upload" size={16} />}
        {progress !== null ? `Uploading ${progress}%` : profile?.document_url ? 'Replace document' : 'Upload document'}
      </button>
    </SectionCard>
  );
}

export default function Profile() {
  const { user, profile, updateMe, refreshMe } = useAuth();
  const [form, setForm] = useState({ name: '', phone: '', location: { address: '', lat: null, lng: null } });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: user?.name || '', phone: user?.phone || '', location: user?.location || { address: '', lat: null, lng: null } });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (e) => {
    e.preventDefault();
    if (form.name.trim().length < 2) {
      setErrors({ name: 'Enter your name' });
      return;
    }
    setSaving(true);
    try {
      const location = form.location?.address?.trim() ? await resolveLocation(form.location) : null;
      await updateMe({ name: form.name.trim(), phone: form.phone.trim(), ...(location ? { location } : {}) });
      setErrors({});
      toast.success('Profile updated');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Could not save your profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container-page max-w-3xl space-y-6 py-5 sm:py-8">
      <div className="flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-bold text-white">{initials(user?.name)}</span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold">{user?.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{ROLE_LABELS[user?.role] || user?.role}</span>
            {user?.is_verified ? <span className="badge bg-primary-light text-primary ring-primary/20">Verified</span> : null}
            {user?.is_premium_partner ? <VerifiedBadge /> : null}
            <span>Member since {formatDate(user?.created_at, { year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      <SectionCard title="Account details" icon="user" bodyClassName="card-pad">
        <form onSubmit={save} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="p-name" label="Name" required error={errors.name}>
              <input id="p-name" className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field id="p-email" label="Email" hint="Contact support to change your email">
              <input id="p-email" className="input" value={user?.email || ''} disabled />
            </Field>
            <Field id="p-phone" label="Phone" error={errors.phone}>
              <input id="p-phone" type="tel" className={`input ${errors.phone ? 'input-error' : ''}`} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </Field>
            {user?.role === 'volunteer' ? (
              <Field id="p-vehicle" label="Vehicle">
                <input id="p-vehicle" className="input" value={VEHICLE_LABELS[profile?.vehicle_type] || '—'} disabled />
              </Field>
            ) : null}
          </div>
          <AddressInput id="p-address" label="Address" value={form.location} onChange={(loc) => setForm((f) => ({ ...f, location: loc }))} error={errors.location} />
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? <Spinner size={16} /> : <Icon name="check" size={16} />} Save changes
          </button>
        </form>
      </SectionCard>

      {user?.role === 'ngo' ? <NgoDocument profile={profile} onUploaded={refreshMe} /> : null}
    </div>
  );
}

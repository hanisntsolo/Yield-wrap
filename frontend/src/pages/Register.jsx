import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import RoleSelector from '../components/auth/RoleSelector';
import { AdminFields, BusinessFields, Field, NgoFields, VolunteerFields, validateDocument } from '../components/auth/RoleFields';
import AddressInput from '../components/common/AddressInput';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import { authApi, errorMessage, fieldErrors } from '../services/api';
import { resolveLocation } from '../services/geocoding';
import { dashboardPathFor, ROLES } from '../utils/constants';

const VALID_ROLES = Object.values(ROLES);

const INITIAL = {
  name: '',
  email: '',
  password: '',
  phone: '',
  location: { address: '', lat: null, lng: null },
  organization_name: '',
  registration_number: '',
  accepted_food_types: ['cooked', 'packaged'],
  storage_capacity_kg: '',
  beneficiary_count: '',
  vehicle_type: 'bike',
  business_name: '',
  business_type: 'other',
  website: '',
  admin_code: '',
};

function validate(form, role, docFile) {
  const e = {};
  if (form.name.trim().length < 2) e.name = 'Enter your full name';
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
  if (form.password.length < 8) e.password = 'At least 8 characters';
  else if (!/[A-Za-z]/.test(form.password) || !/\d/.test(form.password)) e.password = 'Use at least one letter and one number';
  if (form.phone && !/^[0-9+()\-.\s]{0,20}$/.test(form.phone)) e.phone = 'Digits, spaces and + ( ) - only';
  if ((role === 'ngo' || role === 'donor') && !form.location?.address?.trim()) e.location = 'Your address is needed for pickups and matching';
  if (role === 'ngo') {
    if (!form.organization_name.trim()) e.organization_name = 'Required';
    if (!form.registration_number.trim()) e.registration_number = 'Required';
    if (!(Number(form.storage_capacity_kg) > 0)) e.storage_capacity_kg = 'Enter your storage capacity';
    if (form.beneficiary_count !== '' && !(Number(form.beneficiary_count) >= 0)) e.beneficiary_count = 'Must be 0 or more';
    if (!form.accepted_food_types?.length) e.accepted_food_types = 'Pick at least one food type';
    const docErr = validateDocument(docFile);
    if (docErr) e.document = docErr;
  }
  if (role === 'business') {
    const bn = form.business_name.trim();
    if (bn.length < 2 || bn.length > 150) e.business_name = 'Enter your business name (2–150 characters)';
    if (form.website.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.website.trim())) e.website = 'Enter a full URL starting with http:// or https://';
  }
  if (role === 'admin' && !form.admin_code.trim()) e.admin_code = 'Admin code is required';
  return e;
}

function buildPayload(form, role, location) {
  const body = {
    name: form.name.trim(),
    email: form.email.trim(),
    password: form.password,
    role,
    phone: form.phone.trim(),
    location: location || null,
  };
  if (role === 'ngo') {
    Object.assign(body, {
      organization_name: form.organization_name.trim(),
      registration_number: form.registration_number.trim(),
      accepted_food_types: form.accepted_food_types,
      storage_capacity_kg: Number(form.storage_capacity_kg),
      beneficiary_count: form.beneficiary_count === '' ? null : Number(form.beneficiary_count),
    });
  }
  if (role === 'business') {
    Object.assign(body, {
      business_name: form.business_name.trim(),
      business_type: form.business_type || 'other',
      website: form.website.trim() || null,
    });
  }
  if (role === 'volunteer') body.vehicle_type = form.vehicle_type;
  if (role === 'admin') body.admin_code = form.admin_code.trim();
  return body;
}

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const initialRole = VALID_ROLES.includes(params.get('role')) ? params.get('role') : 'donor';
  const [role, setRole] = useState(initialRole);
  const [form, setForm] = useState(INITIAL);
  const [docFile, setDocFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  const changeRole = (r) => {
    setRole(r);
    setErrors({});
    setParams({ role: r }, { replace: true });
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const local = validate(form, role, docFile);
    setErrors(local);
    if (Object.keys(local).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setBusy(true);
    try {
      const location = form.location?.address?.trim() ? await resolveLocation(form.location) : null;
      if ((role === 'ngo' || role === 'donor') && !location) {
        setErrors({ location: 'We could not locate this address — pick a suggestion or use your location' });
        toast.error('Please choose a valid address');
        return;
      }
      const user = await register(buildPayload(form, role, location));
      toast.success('Account created — welcome to YIELD WRAP!');
      if (role === 'ngo' && docFile) {
        try {
          await authApi.uploadNgoDocument(docFile);
          toast.success('Registration document uploaded for verification');
        } catch (err) {
          toast.error(`${errorMessage(err, 'Document upload failed')}. You can upload it later from your profile.`);
        }
      }
      navigate(dashboardPathFor(user?.role || role), { replace: true });
    } catch (err) {
      const fe = fieldErrors(err);
      if (fe.lat || fe.lng || fe['location.lat']) fe.location = fe.location || 'Invalid location';
      setErrors(fe);
      toast.error(errorMessage(err, 'Could not create your account'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout wide title="Create your account" subtitle="Join the network turning surplus food into meals.">
      <form onSubmit={submit} className="space-y-6" noValidate>
        <RoleSelector value={role} onChange={changeRole} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="reg-name" label={role === 'ngo' || role === 'business' ? 'Contact person' : 'Full name'} required error={errors.name}>
            <input id="reg-name" autoComplete="name" className={`input ${errors.name ? 'input-error' : ''}`} value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field id="reg-email" label="Email" required error={errors.email}>
            <input id="reg-email" type="email" autoComplete="email" className={`input ${errors.email ? 'input-error' : ''}`} value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field id="reg-password" label="Password" required error={errors.password} hint="8+ characters with a letter and a number">
            <div className="relative">
              <input
                id="reg-password"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                className={`input pr-11 ${errors.password ? 'input-error' : ''}`}
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
              />
              <button
                type="button"
                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setShowPw((s) => !s)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
              >
                <Icon name={showPw ? 'eye' : 'lock'} size={17} />
              </button>
            </div>
          </Field>
          <Field id="reg-phone" label="Phone" error={errors.phone}>
            <input id="reg-phone" type="tel" autoComplete="tel" className={`input ${errors.phone ? 'input-error' : ''}`} value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
        </div>

        <AddressInput
          id="reg-address"
          label={role === 'ngo' ? 'Organisation address' : role === 'volunteer' ? 'Home base (optional)' : role === 'business' ? 'Business address (optional)' : 'Address'}
          required={role === 'ngo' || role === 'donor'}
          value={form.location}
          onChange={(loc) => set('location', loc)}
          error={errors.location || errors.address}
          hint={role === 'volunteer' ? 'Used to offer you nearby pickups before GPS is available.' : role === 'business' ? 'Helps you find NGO poster spaces near you.' : undefined}
        />

        {role === 'ngo' ? <NgoFields form={form} set={set} errors={errors} docFile={docFile} setDocFile={(f) => { setDocFile(f); setErrors((e) => ({ ...e, document: validateDocument(f) || undefined })); }} /> : null}
        {role === 'volunteer' ? <VolunteerFields form={form} set={set} errors={errors} /> : null}
        {role === 'business' ? <BusinessFields form={form} set={set} errors={errors} /> : null}
        {role === 'admin' ? <AdminFields form={form} set={set} errors={errors} /> : null}

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={busy}>
          {busy ? <Spinner size={18} /> : <Icon name="check-circle" size={18} />} Create account
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import ProgressBar from '../common/ProgressBar';
import { Field } from '../auth/RoleFields';
import { adMarketApi, errorMessage, fieldErrors } from '../../services/api';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../../utils/constants';
import StickerPreview from './StickerPreview';

const EMPTY = { title: '', tagline: '', url: '' };

function validate(form, image) {
  const e = {};
  const t = form.title.trim();
  if (t.length < 2 || t.length > 60) e.title = 'Title must be 2–60 characters';
  if (form.tagline.length > 120) e.tagline = 'Keep the tagline under 120 characters';
  if (form.url.trim() && !/^https?:\/\/\S+\.\S+/i.test(form.url.trim())) e.url = 'Use a full http:// or https:// link';
  if (image) {
    const okType = ALLOWED_IMAGE_TYPES.includes(image.type) || /\.(png|jpe?g)$/i.test(image.name || '');
    if (!okType) e.image = 'Upload a PNG or JPG image';
    else if (image.size > MAX_UPLOAD_BYTES) e.image = 'Image must be 5 MB or smaller';
  }
  return e;
}

/** Upload a creative (multipart). Shows a live sticker preview. */
export default function CreativeUploadForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState('');
  const [errors, setErrors] = useState({});
  const [progress, setProgress] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!image) {
      setPreview('');
      return undefined;
    }
    const u = URL.createObjectURL(image);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [image]);

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pickImage = (file) => {
    const err = validate({ ...EMPTY, title: 'ok' }, file).image;
    setErrors((e) => ({ ...e, image: err }));
    setImage(err ? null : file);
    if (err) toast.error(err);
  };

  const submit = async (ev) => {
    ev.preventDefault();
    const e = validate(form, image);
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fix the highlighted fields');
      return;
    }
    setProgress(0);
    try {
      const created = await adMarketApi.uploadCreative(
        { title: form.title.trim(), tagline: form.tagline.trim(), url: form.url.trim(), image },
        (p) => p?.total && setProgress((p.loaded / p.total) * 100),
      );
      toast.success('Creative submitted for review');
      setForm(EMPTY);
      setImage(null);
      onCreated?.(created);
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Upload failed'));
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
      <fieldset className="space-y-4" disabled={busy}>
        <Field id="cr-title" label="Title" required error={errors.title} hint="Your brand or offer, 2–60 characters">
          <input id="cr-title" className={`input ${errors.title ? 'input-error' : ''}`} maxLength={60} value={form.title} onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field id="cr-tagline" label="Tagline" error={errors.tagline} hint={`${form.tagline.length}/120`}>
          <input id="cr-tagline" className={`input ${errors.tagline ? 'input-error' : ''}`} maxLength={120} value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
        </Field>
        <Field id="cr-url" label="Link for the QR code" error={errors.url} hint="Optional. Scans go here.">
          <input id="cr-url" type="url" inputMode="url" placeholder="https://" className={`input ${errors.url ? 'input-error' : ''}`} value={form.url} onChange={(e) => set('url', e.target.value)} />
        </Field>
        <div>
          <span className="label">Image</span>
          <div className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed p-3 ${errors.image ? 'border-critical' : 'border-slate-300'}`}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => inputRef.current?.click()}>
              <Icon name="upload" size={14} /> {image ? 'Replace' : 'Choose image'}
            </button>
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{image ? image.name : 'PNG or JPG, up to 5 MB. Square works best.'}</span>
            {image ? (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImage(null)} aria-label="Remove image">
                <Icon name="x" size={14} />
              </button>
            ) : null}
            <input
              ref={inputRef}
              type="file"
              className="sr-only"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickImage(f);
                e.target.value = '';
              }}
            />
          </div>
          {errors.image ? <p className="field-error">{errors.image}</p> : null}
        </div>
        {busy ? <ProgressBar value={progress} label="Upload progress" /> : null}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="send" size={16} />} Submit for review
        </button>
      </fieldset>
      <div className="flex flex-col items-center gap-4 rounded-2xl bg-surface p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <StickerPreview variant="round" creative={{ title: form.title || 'Your brand', tagline: form.tagline }} imageSrc={preview} />
        <StickerPreview variant="label" creative={{ title: form.title || 'Your brand', tagline: form.tagline }} imageSrc={preview} />
      </div>
    </form>
  );
}

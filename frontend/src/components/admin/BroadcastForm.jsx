import { useState } from 'react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../common/ConfirmDialog';
import Icon from '../common/Icon';
import SegmentedControl from '../common/SegmentedControl';
import Spinner from '../common/Spinner';
import { adminApi, errorMessage, fieldErrors } from '../../services/api';
import { ROLE_LABELS } from '../../utils/constants';
import { formatNumber } from '../../utils/formatters';

const AUDIENCES = [{ value: '', label: 'Everyone' }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label: `${label}s` }))];
const TITLE_MAX = 120;
const BODY_MAX = 1000;

/** Push + in-app broadcast to everyone or one role (POST /api/admin/broadcast). */
export default function BroadcastForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [role, setRole] = useState('');
  const [errors, setErrors] = useState({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [last, setLast] = useState(null);

  const audienceLabel = AUDIENCES.find((a) => a.value === role)?.label || 'Everyone';

  const review = (e) => {
    e.preventDefault();
    const next = {};
    if (!title.trim()) next.title = 'Add a title';
    if (!body.trim()) next.body = 'Write a message';
    setErrors(next);
    if (!Object.keys(next).length) setConfirmOpen(true);
  };

  const send = async () => {
    setSending(true);
    try {
      const res = await adminApi.broadcast({ title: title.trim(), body: body.trim(), role: role || null });
      setLast({ ...res, title: title.trim(), audience: audienceLabel, at: new Date() });
      toast.success(`Broadcast sent to ${formatNumber(res?.recipients ?? 0)} users`);
      setTitle('');
      setBody('');
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Broadcast failed'));
      throw err;
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form onSubmit={review} className="space-y-4" noValidate>
        <div>
          <span className="label">Audience</span>
          <SegmentedControl ariaLabel="Audience" options={AUDIENCES} value={role} onChange={setRole} size="sm" />
        </div>
        <div>
          <label htmlFor="bc-title" className="label">
            Title <span className="text-critical">*</span>
          </label>
          <input id="bc-title" maxLength={TITLE_MAX} className={`input ${errors.title ? 'input-error' : ''}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Heavy rain expected tonight" />
          <div className="flex justify-between">
            {errors.title ? <p className="field-error">{errors.title}</p> : <span />}
            <span className="field-hint font-mono">{title.length}/{TITLE_MAX}</span>
          </div>
        </div>
        <div>
          <label htmlFor="bc-body" className="label">
            Message <span className="text-critical">*</span>
          </label>
          <textarea id="bc-body" rows={5} maxLength={BODY_MAX} className={`input resize-y ${errors.body ? 'input-error' : ''}`} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-between">
            {errors.body ? <p className="field-error">{errors.body}</p> : <span />}
            <span className="field-hint font-mono">{body.length}/{BODY_MAX}</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={sending}>
          {sending ? <Spinner size={16} /> : <Icon name="send" size={16} />} Review & send
        </button>
      </form>

      <aside className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Preview</p>
        <div className="rounded-2xl border border-slate-200 bg-surface p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Icon name="megaphone" size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-dark">{title || 'Notification title'}</p>
              <p className="mt-0.5 line-clamp-4 break-words text-xs text-slate-600">{body || 'Your message will appear here.'}</p>
            </div>
          </div>
        </div>
        {last ? (
          <div className="rounded-2xl bg-primary-light p-4 text-sm" role="status">
            <p className="font-semibold text-primary">Last broadcast delivered</p>
            <p className="mt-1 truncate text-slate-700">“{last.title}” → {last.audience}</p>
            <p className="mt-1 font-mono text-xs text-slate-600">
              {formatNumber(last.recipients)} recipients · {formatNumber(last.push_sent)} push sent
            </p>
          </div>
        ) : null}
      </aside>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={send}
        tone="primary"
        title="Send this broadcast?"
        confirmLabel="Send now"
        message={
          <>
            <strong className="text-dark">“{title}”</strong> will be sent to <strong className="text-dark">{audienceLabel.toLowerCase()}</strong> as a push and in-app notification.
          </>
        }
      />
    </div>
  );
}

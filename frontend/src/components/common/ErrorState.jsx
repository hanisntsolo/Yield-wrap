import Icon from './Icon';
import { errorMessage } from '../../services/api';

export default function ErrorState({ error, onRetry, title = 'Could not load this section', compact = false }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-10'}`} role="alert">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-critical-light text-critical">
        <Icon name="alert" size={22} />
      </div>
      <h3 className="text-sm font-semibold text-dark">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-slate-500">{errorMessage(error)}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={onRetry}>
          <Icon name="refresh" size={14} /> Retry
        </button>
      ) : null}
    </div>
  );
}

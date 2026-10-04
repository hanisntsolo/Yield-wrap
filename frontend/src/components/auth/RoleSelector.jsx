import Icon from '../common/Icon';
import { ROLE_OPTIONS } from '../../utils/constants';

/** Radio-card picker for the account role. */
export default function RoleSelector({ value, onChange }) {
  return (
    <fieldset>
      <legend className="label">I am joining as</legend>
      <div role="radiogroup" className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5">
        {ROLE_OPTIONS.map((r) => {
          const on = value === r.value;
          return (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(r.value)}
              className={`flex flex-col items-start gap-2 rounded-2xl border-2 p-3 text-left transition-all focus-visible:ring-2 focus-visible:ring-primary/50 sm:p-4 ${
                on ? 'border-primary bg-primary-light shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${on ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>
                <Icon name={r.icon} size={18} />
              </span>
              <span className="text-sm font-bold text-dark">{r.label}</span>
              <span className="hidden text-xs leading-snug text-slate-500 sm:block">{r.description}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

import { useId, useState } from 'react';
import Icon from './Icon';

/** Tag input: type + Enter/comma to add, Backspace to remove, optional quick suggestions. */
export default function ChipsInput({ value = [], onChange, label, placeholder = 'Type and press Enter', suggestions = [], id }) {
  const autoId = useId();
  const inputId = id || autoId;
  const [text, setText] = useState('');
  const list = Array.isArray(value) ? value : [];

  const add = (raw) => {
    const parts = String(raw)
      .split(',')
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...list];
    parts.forEach((p) => {
      if (!next.includes(p)) next.push(p);
    });
    onChange?.(next);
    setText('');
  };
  const remove = (item) => onChange?.(list.filter((v) => v !== item));

  const onKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && list.length) {
      remove(list[list.length - 1]);
    }
  };

  const remaining = suggestions.filter((s) => !list.includes(s));

  return (
    <div>
      {label ? (
        <label htmlFor={inputId} className="label">
          {label}
        </label>
      ) : null}
      <div className="input flex min-h-[44px] flex-wrap items-center gap-1.5 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        {list.map((item) => (
          <span key={item} className="inline-flex items-center gap-1 rounded-full bg-critical-light px-2.5 py-0.5 text-xs font-semibold text-critical">
            {item}
            <button type="button" onClick={() => remove(item)} className="rounded-full hover:bg-critical/10" aria-label={`Remove ${item}`}>
              <Icon name="x" size={12} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={text}
          onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={onKeyDown}
          onBlur={() => text && add(text)}
          placeholder={list.length ? '' : placeholder}
          className="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-sm outline-none focus:ring-0"
        />
      </div>
      {remaining.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {remaining.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-xs text-slate-500 transition-colors hover:border-critical/50 hover:text-critical"
            >
              + {s}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

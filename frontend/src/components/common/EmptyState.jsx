import Icon from './Icon';

export default function EmptyState({ icon = 'inbox', title, description, action, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'px-4 py-6' : 'px-6 py-12'} ${className}`}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary">
        <Icon name={icon} size={24} />
      </div>
      {title ? <h3 className="text-sm font-semibold text-dark">{title}</h3> : null}
      {description ? <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

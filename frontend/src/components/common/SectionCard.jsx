import Icon from './Icon';

/** Card with a header row (title, optional icon/subtitle, right-side actions). */
export default function SectionCard({ title, subtitle, icon, actions, children, className = '', bodyClassName = '', id }) {
  return (
    <section id={id} className={`card overflow-hidden ${className}`} aria-labelledby={id ? `${id}-title` : undefined}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-light text-primary">
                <Icon name={icon} size={17} />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 id={id ? `${id}-title` : undefined} className="card-title truncate">
                {title}
              </h2>
              {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

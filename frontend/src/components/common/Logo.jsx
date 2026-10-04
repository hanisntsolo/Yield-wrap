import { Link } from 'react-router-dom';

export function LogoMark({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#1A7A4A" />
      <path d="M18 22c6 0 10 4 14 10 4-6 8-10 14-10" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M32 32v14" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <circle cx="46" cy="18" r="5" fill="#F39C12" />
    </svg>
  );
}

export default function Logo({ to = '/', light = false, className = '' }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 rounded-lg ${className}`} aria-label="YIELD WRAP home">
      <LogoMark />
      <span className={`text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-dark'}`}>
        YIELD<span className="text-primary"> WRAP</span>
      </span>
    </Link>
  );
}

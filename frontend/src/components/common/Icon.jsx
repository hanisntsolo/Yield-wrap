// Lightweight inline SVG icon set (24x24, stroke-based) so no icon dependency is needed.

const ICONS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M5 13l4 4L19 7" />,
  'check-all': <path d="M2 13l4 4L16 7M12 15l2 2L22 7" />,
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </>
  ),
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'chevron-up': <path d="M18 15l-6-6-6 6" />,
  'chevron-right': <path d="M9 6l6 6-6 6" />,
  'chevron-left': <path d="M15 6l-6 6 6 6" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  bell: (
    <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.66V5a2 2 0 10-4 0v.34A6 6 0 006 11v3.2a2 2 0 01-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
  ),
  'map-pin': (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 1114 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  map: <path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4zM9 4v13.5M15 6.5V20" />,
  truck: (
    <>
      <path d="M3 6.5h11v9.5H3zM14 10h3.8l3.2 3.4V16h-7z" />
      <circle cx="7" cy="18" r="1.8" />
      <circle cx="17.5" cy="18" r="1.8" />
    </>
  ),
  leaf: <path d="M5 19.5C5 11 10.5 5 20 4.5c0 9.5-6 15-14 15-.4 0-.7 0-1-.1M5 19.5L13 11.5" />,
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16.5 14.2c2.6.4 4.5 2.7 4.5 5.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </>
  ),
  package: <path d="M21 8l-9-5-9 5v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8M7.5 5.5l9 5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.2 2" />
    </>
  ),
  alert: <path d="M12 3.5l9.5 16.5h-19L12 3.5zM12 10v4.5M12 17.4v.1" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </>
  ),
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />,
  upload: <path d="M12 16V5M7 9.5l5-5 5 5M5 20h14" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </>
  ),
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />,
  eye: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  logout: <path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 16l4-4-4-4M20 12H10" />,
  star: <path d="M12 3.5l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17.3l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8L12 3.5z" />,
  trophy: (
    <path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H4.5v1A3.5 3.5 0 008 10.5M16 6h3.5v1a3.5 3.5 0 01-3.5 3.5M12 13v4M8 21h8M9.5 17h5v4h-5z" />
  ),
  navigation: <path d="M12 2.5l7 18.5-7-4-7 4 7-18.5z" />,
  refresh: <path d="M20 11.5A8 8 0 104.3 15M20 4.5v7h-7" />,
  send: <path d="M21.5 2.5L10.5 13.5M21.5 2.5l-7 19-4-8.5-8.5-4 19.5-6.5z" />,
  building: (
    <path d="M4 21V5a1 1 0 011-1h9a1 1 0 011 1v16M15 9h4a1 1 0 011 1v11M3 21h18M8 8h3M8 12h3M8 16h3" />
  ),
  heart: <path d="M12 20s-7.5-4.6-9.3-9.4A5 5 0 0112 7.3a5 5 0 019.3 3.3C19.5 15.4 12 20 12 20z" />,
  chart: <path d="M4 20h16M7 16.5v-5M12 16.5V6M17 16.5v-8" />,
  shield: <path d="M12 3l8 3v6c0 4.6-3.4 8.4-8 9-4.6-.6-8-4.4-8-9V6l8-3zM9 12l2.2 2.2L15.5 10" />,
  crosshair: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>
  ),
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />,
  zap: <path d="M13 2.5L4 14h7l-1 7.5L19 10h-7l1-7.5z" />,
  utensils: <path d="M7 3v8M4.5 3v5a2.5 2.5 0 005 0V3M7 11v10M17.5 3C15.5 3 14.5 5 14.5 8v5h3v8M17.5 3v18" />,
  cloud: <path d="M7 18.5h10a4 4 0 00.6-7.95A6 6 0 006.2 9.6 4.5 4.5 0 007 18.5z" />,
  droplet: <path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>
  ),
  file: <path d="M14 3H6.5a1 1 0 00-1 1v16a1 1 0 001 1h11a1 1 0 001-1V7.5L14 3zM14 3v4.5h4.5M9 13h6M9 17h6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7.5a4 4 0 018 0V11" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3.5 6.5l8.5 6 8.5-6" />
    </>
  ),
  phone: (
    <path d="M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 006.1 6.1l1.4-2.3L20 15.5V19a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" />
  ),
  megaphone: <path d="M3 10.5v3a1 1 0 001 1h2.5L13 19V5L6.5 9.5H4a1 1 0 00-1 1zM17 8.5a5 5 0 010 7M19.5 6a8.5 8.5 0 010 12" />,
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.7 5.7l12.6 12.6" />
    </>
  ),
  sparkles: (
    <path d="M11 3.5l1.8 4.7 4.7 1.8-4.7 1.8L11 16.5l-1.8-4.7L4.5 10l4.7-1.8L11 3.5zM18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" />
  ),
  route: (
    <>
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M8.2 18H15a3 3 0 000-6H9a3 3 0 010-6h6.8" />
    </>
  ),
  filter: <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5z" />,
  dots: (
    <>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </>
  ),
  power: <path d="M12 3v8M7 6.3a7.5 7.5 0 1010 0" />,
  inbox: <path d="M3 13l2.5-8h13L21 13v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM3 13h5l1.5 2.5h5L16 13h5" />,
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.2" />
    </>
  ),
  gauge: <path d="M4 17a8 8 0 1116 0M12 17l4-6M3 17h2M19 17h2M12 7V5" />,
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({ name, size = 20, className = '', strokeWidth = 1.8, title, ...rest }) {
  const glyph = ICONS[name] || ICONS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}

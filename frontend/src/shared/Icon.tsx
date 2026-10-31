import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  today: <path d="M4 16.5h16M7.5 16.5a4.5 4.5 0 1 1 9 0M12 4v2M5.3 7.3l1.4 1.4M18.7 7.3l-1.4 1.4" />,
  calendar: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2.5" />
      <path d="M8 3.5v4M16 3.5v4M4 10h16M8 13.5h.01M12 13.5h.01M16 13.5h.01M8 17h.01M12 17h.01" />
    </>
  ),
  changes: (
    <path d="M5 8h11.5a3 3 0 0 1 0 6H8M5 8l2.5-2.5M5 8l2.5 2.5M19 16H7.5a3 3 0 0 1 0-6H16M19 16l-2.5-2.5M19 16l-2.5 2.5" />
  ),
  settings: <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M9 14v6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  'arrow-left': <path d="m15 5-7 7 7 7" />,
  'arrow-right': <path d="m9 5 7 7-7 7" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  sync: <path d="M19 8a8 8 0 0 0-13.5-2M5 16a8 8 0 0 0 13.5 2M5 4v4h4M19 20v-4h-4" />,
  pin: (
    <>
      <path d="M12 21s6-5.3 6-11a6 6 0 1 0-12 0c0 5.7 6 11 6 11Z" />
      <circle cx="12" cy="10" r="2" />
    </>
  ),
  teacher: (
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
  spark: (
    <>
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
      <path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  collapse: <path d="m14 6-6 6 6 6" />,
};

interface IconProps {
  name: keyof typeof PATHS;
  className?: string;
}

export function Icon({ name, className = 'icon' }: IconProps) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  );
}

export function IconSprite() {
  return (
    <svg className="icon-sprite" aria-hidden="true">
      {Object.entries(PATHS).map(([name, path]) => (
        <symbol id={`i-${name}`} viewBox="0 0 24 24" key={name}>
          {path}
        </symbol>
      ))}
    </svg>
  );
}

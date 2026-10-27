// frontend/src/shared/BottomNav.tsx
export type PageKey = 'today' | 'week' | 'changes' | 'settings' | 'device';

interface BottomNavProps {
  page: PageKey;
  onChange: (page: PageKey) => void;
  cloudMode?: boolean;
}

const NAV_ITEMS = {
  today: { label: '今天', glyph: '今' },
  week: { label: '周课表', glyph: '周' },
  changes: { label: '变动', glyph: '变' },
  settings: { label: '设置', glyph: '设' },
  device: { label: '设备', glyph: '机' },
} as const;

export function BottomNav({ page, onChange, cloudMode = false }: BottomNavProps) {
  const keys: PageKey[] = cloudMode
    ? ['today', 'week', 'changes', 'device']
    : ['today', 'week', 'changes', 'settings'];

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {keys.map((key) => {
        const item = NAV_ITEMS[key];
        return (
          <button
            key={key}
            type="button"
            className={`nav-item ${page === key ? 'is-active' : ''}`}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onChange(key)}
          >
            <span className="nav-glyph" aria-hidden="true">{item.glyph}</span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

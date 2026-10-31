import type { PageKey } from '../types';
import { Icon } from './Icon';

interface BottomNavProps {
  page: PageKey;
  onChange: (page: PageKey) => void;
  cloudMode?: boolean;
  unreadCount?: number;
}

const NAV_ITEMS = {
  today: { label: '今天', icon: 'today' },
  schedule: { label: '课表', icon: 'calendar' },
  changes: { label: '变动', icon: 'changes' },
  settings: { label: '设置', icon: 'settings' },
  device: { label: '设备', icon: 'settings' },
} as const;

export function BottomNav({
  page,
  onChange,
  cloudMode = false,
  unreadCount = 0,
}: BottomNavProps) {
  const keys: PageKey[] = cloudMode
    ? ['today', 'schedule', 'changes', 'device']
    : ['today', 'schedule', 'changes', 'settings'];
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <nav className="bottom-nav" aria-label="主导航">
      {keys.map((key) => {
        const item = NAV_ITEMS[key];
        return (
          <button
            key={key}
            type="button"
            className={`bottom-item ${page === key ? 'is-active' : ''}`}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onChange(key)}
          >
            <span className="bottom-icon-wrap">
              <Icon name={item.icon} />
              {key === 'changes' && unreadCount > 0 && <i>{badgeLabel}</i>}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

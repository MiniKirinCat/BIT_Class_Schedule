import type { ReactNode } from 'react';
import type { AppStatus } from '../data/types';
import type {
  AppMode,
  PageKey,
  PageMeta,
  ScheduleSnapshot,
  SidebarState,
} from '../types';
import { formatDateTime } from '../lib/schedule';
import { BottomNav } from './BottomNav';
import { Icon, IconSprite } from './Icon';

interface AppShellProps {
  snapshot: ScheduleSnapshot | null;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  meta: PageMeta;
  cloudMode?: boolean;
  term?: string | null;
  currentTerm?: string | null;
  onChooseTerm?: () => void;
  mode?: AppMode;
  onModeChange?: (mode: AppMode) => void;
  sidebar?: SidebarState;
  onToggleSidebar?: () => void;
  unreadCount?: number;
  status?: AppStatus | null;
  cached?: boolean;
  syncing?: boolean;
  onSync?: () => void;
  banner?: ReactNode;
  children: ReactNode;
}

const NAV_ITEMS = {
  today: { label: '今天', icon: 'today' },
  schedule: { label: '课表', icon: 'calendar' },
  changes: { label: '变动', icon: 'changes' },
  settings: { label: '设置', icon: 'settings' },
  device: { label: '设备', icon: 'settings' },
} as const;

function syncState({
  snapshot,
  status,
  cached,
  syncing,
}: {
  snapshot: ScheduleSnapshot | null;
  status?: AppStatus | null;
  cached: boolean;
  syncing: boolean;
}) {
  const syncTime = snapshot ? formatDateTime(snapshot.synced_at) : '尚未同步';
  const ageHours = snapshot
    ? (Date.now() - new Date(snapshot.synced_at).getTime()) / 3_600_000
    : 0;
  const stale = Boolean(
    snapshot && ageHours > snapshot.sync_interval_days * 24 + 24,
  );
  if (syncing || status?.sync_status === 'running') {
    return { title: '正在同步', time: '请稍候', alert: false };
  }
  if (status?.sync_status === 'failed' || status?.sync_status === 'anomaly') {
    return { title: '同步异常', time: syncTime, alert: true };
  }
  if (cached) {
    return { title: '缓存快照', time: syncTime, alert: true };
  }
  if (stale) {
    return { title: '数据可能已过期', time: syncTime, alert: true };
  }
  return { title: '已同步', time: syncTime, alert: false };
}

export function AppShell({
  snapshot,
  page,
  onNavigate,
  meta,
  cloudMode = false,
  term = null,
  currentTerm = null,
  onChooseTerm,
  mode = 'workbench',
  onModeChange,
  sidebar = 'expanded',
  onToggleSidebar,
  unreadCount = 0,
  status = null,
  cached = false,
  syncing = false,
  onSync,
  banner,
  children,
}: AppShellProps) {
  const archived = Boolean(term && currentTerm && term !== currentTerm);
  const canSwitchTerm = Boolean(term && onChooseTerm);
  const showMobileTerm =
    canSwitchTerm && page !== 'settings' && page !== 'device';
  const keys: PageKey[] = cloudMode
    ? ['today', 'schedule', 'changes', 'device']
    : ['today', 'schedule', 'changes', 'settings'];
  const sync = syncState({ snapshot, status, cached, syncing });
  const syncShort = sync.time.slice(-5);
  const showSyncButton = !cloudMode && Boolean(onSync);
  const sidebarCollapsed = sidebar === 'collapsed' || mode === 'focus';
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  const brand = (
    <div className="brand-block">
      <div className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32">
          <rect x="1" y="1" width="30" height="30" rx="9" />
          <path d="M9 11h14M9 16h9M9 21h14" />
          <circle cx="22" cy="16" r="2.4" />
        </svg>
      </div>
      <div>
        <div className="brand-name">下一节</div>
        <div className="brand-caption">
          {cloudMode ? 'CLOUD SNAPSHOT' : 'LOCAL TIMETABLE'}
        </div>
      </div>
    </div>
  );

  return (
    <>
      <IconSprite />
      <div className={`app ${cloudMode ? 'is-cloud' : ''}`}>
        <aside className="sidebar">
          {brand}

          {canSwitchTerm && term && onChooseTerm && (
            <button
              type="button"
              className="term-button"
              aria-label={`切换学期，当前查看 ${term}`}
              onClick={onChooseTerm}
            >
              <span>
                <span className="term-eyebrow">
                  {archived ? '历史学期' : '当前学期'}
                </span>
                <strong>{term}</strong>
              </span>
              <Icon name="chevron" />
            </button>
          )}

          <nav className="side-nav" aria-label="主导航">
            {keys.map((key) => {
              const item = NAV_ITEMS[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={`nav-item ${page === key ? 'is-active' : ''}`}
                  aria-label={item.label}
                  title={item.label}
                  aria-current={page === key ? 'page' : undefined}
                  onClick={() => onNavigate(key)}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                  {key === 'changes' && unreadCount > 0 ? (
                    <span className="nav-badge">{badgeLabel}</span>
                  ) : (
                    <span className="nav-marker" />
                  )}
                </button>
              );
            })}
          </nav>

          {onToggleSidebar && (
            <button
              type="button"
              className={`side-collapse ${sidebarCollapsed ? 'is-collapsed' : ''}`}
              aria-label={
                mode === 'focus'
                  ? '专注模式已自动折叠侧栏'
                  : sidebarCollapsed
                    ? '展开侧栏'
                    : '收起侧栏'
              }
              title={
                mode === 'focus'
                  ? '专注模式已自动折叠侧栏'
                  : sidebarCollapsed
                    ? '展开侧栏'
                    : '收起侧栏'
              }
              disabled={mode === 'focus'}
              onClick={onToggleSidebar}
            >
              <Icon name="collapse" />
              <span>{sidebarCollapsed ? '展开侧栏' : '收起侧栏'}</span>
            </button>
          )}

          <div className="side-note">
            <span className="side-note-label">A QUIET COMPANION</span>
            <p>把下一节课，放在眼前。</p>
          </div>

          <div
            className={`side-sync ${sync.alert ? 'is-alert' : ''}`}
            title={`${sync.title} · ${sync.time}`}
          >
            <div className="sync-orbit">
              <span />
            </div>
            <div>
              <div className="sync-title">{sync.title}</div>
              <div className="sync-time">{sync.time}</div>
            </div>
            {showSyncButton && (
              <button
                type="button"
                className={`icon-button ${syncing ? 'is-syncing' : ''}`}
                aria-label="立即同步"
                disabled={syncing}
                onClick={onSync}
              >
                <Icon name="sync" />
              </button>
            )}
          </div>
        </aside>

        <div className="shell">
          <header className="topbar">
            <div className="mobile-brand">
              <div className="brand-mark compact" aria-hidden="true">
                <svg viewBox="0 0 32 32">
                  <rect x="1" y="1" width="30" height="30" rx="9" />
                  <path d="M9 11h14M9 16h9M9 21h14" />
                  <circle cx="22" cy="16" r="2.4" />
                </svg>
              </div>
              <div className="mobile-brand-copy">
                <strong>下一节</strong>
                {showMobileTerm && term && onChooseTerm ? (
                  <button
                    type="button"
                    className="mobile-term"
                    aria-label={`切换学期，当前查看 ${term}`}
                    onClick={onChooseTerm}
                  >
                    {term}
                  </button>
                ) : (
                  <span className="mobile-term is-static">
                    {cloudMode ? '只读快照' : '本地课表'}
                  </span>
                )}
              </div>
            </div>

            <div className="page-meta">
              <div className="page-kicker">
                <span className="live-dot" />
                <span>{meta.kicker}</span>
              </div>
              <h1>{meta.title}</h1>
              <p>{meta.subtitle}</p>
            </div>

            <div className="top-actions">
              {onModeChange && (
                <div className="mode-switch" role="group" aria-label="桌面布局">
                  <button
                    type="button"
                    className={mode === 'workbench' ? 'is-active' : ''}
                    aria-pressed={mode === 'workbench'}
                    onClick={() => onModeChange('workbench')}
                  >
                    工作台
                  </button>
                  <button
                    type="button"
                    className={mode === 'focus' ? 'is-active' : ''}
                    aria-pressed={mode === 'focus'}
                    onClick={() => onModeChange('focus')}
                  >
                    专注
                  </button>
                </div>
              )}
              {showSyncButton && (
                <button
                  type="button"
                  className={`sync-top ${syncing ? 'is-syncing' : ''}`}
                  disabled={syncing}
                  title={syncing ? '正在同步' : `上次同步 ${sync.time}`}
                  onClick={onSync}
                >
                  <span className="live-dot" />
                  <span className="sync-top-label">
                    {syncing ? '同步中' : '同步'}
                  </span>
                  {!syncing && <span>{syncShort}</span>}
                  <Icon name="sync" className="sync-top-icon" />
                </button>
              )}
            </div>
          </header>

          {banner}
          <main className="main">{children}</main>
        </div>
      </div>

      <BottomNav
        page={page}
        onChange={onNavigate}
        cloudMode={cloudMode}
        unreadCount={unreadCount}
      />
    </>
  );
}

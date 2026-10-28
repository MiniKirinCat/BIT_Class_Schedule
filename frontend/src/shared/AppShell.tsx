import type { ReactNode } from 'react';
import type { ScheduleSnapshot } from '../types';
import { BottomNav, type PageKey } from './BottomNav';
import { StaleBadge } from './StaleBadge';

interface AppShellProps {
  snapshot: ScheduleSnapshot | null;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  cloudMode?: boolean;
  term?: string | null;
  currentTerm?: string | null;
  onChooseTerm?: () => void;
  statusChip?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  snapshot,
  page,
  onNavigate,
  cloudMode = false,
  term = null,
  currentTerm = null,
  onChooseTerm,
  statusChip,
  banner,
  children,
}: AppShellProps) {
  const archived = Boolean(term && currentTerm && term !== currentTerm);
  const showTerm =
    Boolean(term && onChooseTerm) && page !== 'settings' && page !== 'device';
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">下一节</span>
          <span className="brand-caption">{cloudMode ? '只读快照' : '本地课表'}</span>
          {showTerm && term && onChooseTerm && (
            <button
              type="button"
              className={`term-switch ${archived ? 'is-archived' : ''}`}
              aria-label={`切换学期，当前查看 ${term}`}
              onClick={onChooseTerm}
            >
              {term}
              {archived && <span className="term-history-tag">历史</span>}
              <span className="term-chevron" aria-hidden="true">
                ⌄
              </span>
            </button>
          )}
        </div>
        {statusChip ?? <StaleBadge snapshot={snapshot} />}
      </header>
      {banner}
      <main className="page">{children}</main>
      <BottomNav page={page} onChange={onNavigate} cloudMode={cloudMode} />
    </div>
  );
}

import type { ReactNode } from 'react';
import type { ScheduleSnapshot } from '../types';
import { BottomNav, type PageKey } from './BottomNav';
import { StaleBadge } from './StaleBadge';

interface AppShellProps {
  snapshot: ScheduleSnapshot | null;
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  cloudMode?: boolean;
  statusChip?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}

export function AppShell({
  snapshot,
  page,
  onNavigate,
  cloudMode = false,
  statusChip,
  banner,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">下一节</span>
          <span className="brand-caption">{cloudMode ? '只读快照' : '本地课表'}</span>
        </div>
        {statusChip ?? <StaleBadge snapshot={snapshot} />}
      </header>
      {banner}
      <main className="page">{children}</main>
      <BottomNav page={page} onChange={onNavigate} cloudMode={cloudMode} />
    </div>
  );
}

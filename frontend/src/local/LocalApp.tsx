// frontend/src/local/LocalApp.tsx
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { CourseSession, ScheduleSnapshot, TodayLayout, WeekLayout } from '../types';
import type { AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import {
  dateKeyInShanghai,
  unreadChangeCount,
} from '../lib/schedule';
import {
  readLastSeenChangeId,
  STORAGE_KEYS,
  useStoredChoice,
  writeLastSeenChangeId,
  defaultWeekLayout,
} from '../lib/storage';
import { useTheme } from '../lib/theme';
import { AppShell } from '../shared/AppShell';
import { type PageKey } from '../shared/BottomNav';
import { StaleBadge } from '../shared/StaleBadge';
import { TodayPage } from '../shared/TodayPage';
import { WeekPage } from '../shared/week/WeekPage';
import { ChangesPage } from '../shared/changes/ChangesPage';
import { CourseDetailSheet } from '../shared/today/CourseDetailSheet';
import { LayoutSheet } from '../shared/today/LayoutSheet';
import { SetupWizard } from './SetupWizard';
import { SettingsPage } from './SettingsPage';

export function LocalApp() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [page, setPage] = useState<PageKey>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [course, setCourse] = useState<CourseSession | null>(null);
  const [layoutSheet, setLayoutSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSeenId, setLastSeenId] = useState(readLastSeenChangeId);

  const [todayLayout, setTodayLayout] = useStoredChoice<TodayLayout>(
    STORAGE_KEYS.todayLayout,
    'focus',
    ['focus', 'timeline', 'compact'] as const,
  );
  const [weekLayout, setWeekLayout] = useStoredChoice<WeekLayout>(
    STORAGE_KEYS.weekLayout,
    defaultWeekLayout(),
    ['grid', 'list'] as const,
  );
  const [theme, setTheme] = useTheme();

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
      if (nextStatus.configured) {
        setSnapshot(await api.dashboard());
      } else {
        setSnapshot(null);
      }
    } catch (caught) {
      setLoadError(messageFromError(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncBusy(true);
    setSyncError('');
    try {
      const result = await api.sync();
      if (result.status === 'failed' || result.status === 'anomaly') {
        setSyncError(result.message);
      }
      await refresh();
    } catch (caught) {
      setSyncError(messageFromError(caught));
    } finally {
      setSyncBusy(false);
    }
  }, [refresh]);

  const markSeen = useCallback((id: number) => {
    setLastSeenId(id);
    writeLastSeenChangeId(id);
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" aria-hidden="true" />
        正在加载…
      </div>
    );
  }

  if (loadError && !status) {
    return (
      <div className="error-state">
        <strong>无法连接本地服务</strong>
        <span>{loadError}</span>
        <button type="button" className="button" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  if (!status) {
    return (
      <div className="error-state">
        <strong>无法读取本地状态</strong>
        <span>请稍后重试，或重新启动下一节。</span>
        <button type="button" className="button" onClick={() => void refresh()}>
          重试
        </button>
      </div>
    );
  }

  if (!status.configured || showSetup) {
    return (
      <SetupWizard
        onComplete={async () => {
          await refresh();
          setShowSetup(false);
        }}
        onCancel={status.configured ? () => setShowSetup(false) : undefined}
      />
    );
  }

  const unread = snapshot ? unreadChangeCount(snapshot.changes, lastSeenId) : 0;
  const today = dateKeyInShanghai(now);

  let content: ReactNode = null;
  if (!snapshot) {
    content = (
      <div className="empty-state">
        <strong>还没有课表快照</strong>
        <span>连接教务系统后会自动同步一次；也可以点下方按钮手动同步。</span>
        {syncError && <p className="form-error">{syncError}</p>}
        <button
          type="button"
          className="button button-primary"
          disabled={syncBusy}
          onClick={() => void handleSync()}
        >
          {syncBusy ? '正在同步…' : '立即同步'}
        </button>
      </div>
    );
  } else if (page === 'week') {
    content = (
      <WeekPage
        snapshot={snapshot}
        layout={weekLayout}
        today={today}
        onLayoutChange={setWeekLayout}
        onOpenCourse={setCourse}
      />
    );
  } else if (page === 'changes') {
    content = (
      <ChangesPage
        changes={snapshot.changes}
        lastSeenId={lastSeenId}
        onSeen={markSeen}
      />
    );
  } else if (page === 'settings') {
    content = (
      <SettingsPage
        status={status}
        theme={theme}
        onThemeChange={setTheme}
        onRelogin={() => setShowSetup(true)}
        onSync={handleSync}
        syncBusy={syncBusy}
        syncError={syncError}
      />
    );
  } else {
    content = (
      <TodayPage
        snapshot={snapshot}
        now={now}
        layout={todayLayout}
        unreadCount={unread}
        onOpenCourse={setCourse}
        onOpenLayout={() => setLayoutSheet(true)}
        onOpenChanges={() => setPage('changes')}
        onGoWeek={() => setPage('week')}
      />
    );
  }

  return (
    <>
      <AppShell
        snapshot={snapshot}
        page={page}
        onNavigate={setPage}
        statusChip={<StaleBadge snapshot={snapshot} status={status} />}
      >
        {loadError && <p className="form-error">{loadError}</p>}
        {page !== 'settings' &&
          (status.sync_status === 'failed' || status.sync_status === 'anomaly') &&
          status.last_error && (
            <p className="form-error">上次同步失败：{status.last_error}</p>
          )}
        {syncError && syncError !== status.last_error && page !== 'settings' && (
          <p className="form-error">{syncError}</p>
        )}
        {content}
      </AppShell>
      {course && <CourseDetailSheet course={course} onClose={() => setCourse(null)} />}
      {layoutSheet && (
        <LayoutSheet
          layout={todayLayout}
          onSelect={(next) => {
            setTodayLayout(next);
            setLayoutSheet(false);
          }}
          onClose={() => setLayoutSheet(false)}
        />
      )}
    </>
  );
}

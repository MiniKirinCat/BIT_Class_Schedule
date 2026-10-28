import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CourseSession,
  ScheduleArchive,
  TodayLayout,
  WeekLayout,
} from '../types';
import type { AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import {
  currentSnapshot,
  isArchivedTerm,
  snapshotForTerm,
} from '../lib/archive';
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
import { useAppShortcuts } from '../shared/useAppShortcuts';
import { TodayPage } from '../shared/TodayPage';
import { WeekPage } from '../shared/week/WeekPage';
import { ChangesPage } from '../shared/changes/ChangesPage';
import { CourseDetailSheet } from '../shared/today/CourseDetailSheet';
import { LayoutSheet } from '../shared/today/LayoutSheet';
import { TermSheet } from '../shared/TermSheet';
import { TermOverview } from '../shared/history/TermOverview';
import { SetupWizard } from './SetupWizard';
import { SettingsPage } from './SettingsPage';

export function LocalApp() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [archive, setArchive] = useState<ScheduleArchive | null>(null);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [page, setPage] = useState<PageKey>('today');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showSetup, setShowSetup] = useState(false);
  const [course, setCourse] = useState<CourseSession | null>(null);
  const [layoutSheet, setLayoutSheet] = useState(false);
  const [termSheet, setTermSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSeenId, setLastSeenId] = useState(readLastSeenChangeId);
  const currentTermRef = useRef('');

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

  useAppShortcuts({ onNavigate: setPage });

  const refresh = useCallback(async () => {
    setLoadError('');
    try {
      const nextStatus = await api.status();
      setStatus(nextStatus);
      if (nextStatus.configured) {
        const nextArchive = await api.dashboard();
        setArchive(nextArchive);
        setSelectedTerm((previous) => {
          if (
            !previous ||
            !nextArchive.terms.some((term) => term.term === previous)
          ) {
            return nextArchive.current_term;
          }
          if (
            previous === currentTermRef.current &&
            nextArchive.current_term !== previous
          ) {
            return nextArchive.current_term;
          }
          return previous;
        });
        currentTermRef.current = nextArchive.current_term;
      } else {
        setArchive(null);
        setSelectedTerm('');
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

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh]);

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
        cloudConfigured={status.cloud_configured}
        cloudQrReady={status.cloud_qr_ready}
        cloudPagesUrl={status.cloud_pages_url}
      />
    );
  }

  const current = archive ? currentSnapshot(archive) : null;
  const snapshot = archive
    ? snapshotForTerm(archive, selectedTerm || archive.current_term)
    : null;
  const archived = Boolean(
    archive && snapshot && isArchivedTerm(archive, snapshot.term),
  );
  const unread = current ? unreadChangeCount(current.changes, lastSeenId) : 0;
  const today = dateKeyInShanghai(now);

  let content: ReactNode = null;
  if (page === 'settings') {
    content = (
      <SettingsPage
        status={status}
        theme={theme}
        onThemeChange={setTheme}
        onRelogin={() => setShowSetup(true)}
        onSync={handleSync}
        onRefresh={refresh}
        syncBusy={syncBusy}
        syncError={syncError}
      />
    );
  } else if (!snapshot) {
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
        key={snapshot.term}
        snapshot={snapshot}
        layout={weekLayout}
        today={today}
        weekAnchor={archived ? null : undefined}
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
        term={snapshot.term}
        archived={archived}
      />
    );
  } else if (archived) {
    content = (
      <TermOverview
        snapshot={snapshot}
        onOpenCourse={setCourse}
        onGoWeek={() => setPage('week')}
        onOpenChanges={() => setPage('changes')}
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
        snapshot={current}
        page={page}
        onNavigate={setPage}
        term={snapshot?.term}
        currentTerm={archive?.current_term}
        onChooseTerm={() => setTermSheet(true)}
        statusChip={<StaleBadge snapshot={current} status={status} />}
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
      {course && (
        <CourseDetailSheet
          course={course}
          snapshot={snapshot}
          onClose={() => setCourse(null)}
        />
      )}
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
      {termSheet && archive && (
        <TermSheet
          archive={archive}
          selectedTerm={snapshot?.term ?? archive.current_term}
          onSelect={(term) => {
            setSelectedTerm(term);
            setCourse(null);
            setTermSheet(false);
          }}
          onClose={() => setTermSheet(false)}
        />
      )}
    </>
  );
}

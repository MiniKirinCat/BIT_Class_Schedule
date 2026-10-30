import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  AppMode,
  ChangeRecord,
  CourseSession,
  PageKey,
  PageMeta,
  ScheduleArchive,
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
  buildTodayModel,
  currentWeek,
  dateKeyInShanghai,
  formatDateLabel,
  unreadChangeCount,
  weekdayName,
} from '../lib/schedule';
import {
  readLastSeenChangeId,
  STORAGE_KEYS,
  useStoredChoice,
  writeLastSeenChangeId,
  defaultWeekLayout,
} from '../lib/storage';
import { AppShell } from '../shared/AppShell';
import { useAppShortcuts } from '../shared/useAppShortcuts';
import { TodayPage } from '../shared/TodayPage';
import {
  SchedulePage,
  type ScheduleIntent,
} from '../shared/schedule/SchedulePage';
import { ChangesPage } from '../shared/changes/ChangesPage';
import { ChangeDetailSheet } from '../shared/changes/ChangeDetailSheet';
import { CourseDetailSheet } from '../shared/today/CourseDetailSheet';
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
  const [change, setChange] = useState<ChangeRecord | null>(null);
  const [termSheet, setTermSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [lastSeenId, setLastSeenId] = useState(readLastSeenChangeId);
  const [scheduleIntent, setScheduleIntent] = useState<ScheduleIntent | null>(
    null,
  );
  const [scheduleMeta, setScheduleMeta] = useState<PageMeta | null>(null);
  const currentTermRef = useRef('');
  const intentNonce = useRef(0);

  const [mode, setMode] = useStoredChoice<AppMode>(
    STORAGE_KEYS.appMode,
    'workbench',
    ['workbench', 'focus'] as const,
  );
  const [weekLayout, setWeekLayout] = useStoredChoice<WeekLayout>(
    STORAGE_KEYS.weekLayout,
    defaultWeekLayout(),
    ['grid', 'list'] as const,
  );

  useAppShortcuts({ onNavigate: setPage });

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

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

  useEffect(() => {
    if (page !== 'schedule') setScheduleMeta(null);
  }, [page]);

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

  const openSchedule = useCallback((intent: Omit<ScheduleIntent, 'nonce'>) => {
    intentNonce.current += 1;
    setScheduleIntent({ ...intent, nonce: intentNonce.current });
    setPage('schedule');
  }, []);

  const today = dateKeyInShanghai(now);
  const current = archive ? currentSnapshot(archive) : null;
  const snapshot = archive
    ? snapshotForTerm(archive, selectedTerm || archive.current_term)
    : null;
  const archived = Boolean(
    archive && snapshot && isArchivedTerm(archive, snapshot.term),
  );
  const unread = current ? unreadChangeCount(current.changes, lastSeenId) : 0;
  const model = snapshot ? buildTodayModel(snapshot, now) : null;

  const meta: PageMeta = (() => {
    if (page === 'settings') {
      return {
        kicker: 'PREFERENCES · LOCAL FIRST',
        title: '设置',
        subtitle: '本机数据、提醒与外观',
      };
    }
    if (page === 'schedule' && scheduleMeta) {
      return scheduleMeta;
    }
    if (page === 'changes') {
      return {
        kicker: `SYNC DELTA · ${snapshot?.changes.length ?? 0} ITEMS`,
        title: '变动',
        subtitle: archived
          ? `${snapshot?.term ?? ''} · 历史学期只读记录`
          : '教室调整、节次调整与停课，按检测时间排序',
      };
    }
    if (page === 'today' && archived && snapshot) {
      return {
        kicker: 'ARCHIVE · TERM REVIEW',
        title: '学期回顾',
        subtitle: `${snapshot.term} · 历史学期`,
      };
    }
    if (model) {
      return {
        kicker: `WEEK ${String(model.week).padStart(2, '0')} · ${weekdayName(model.weekday)}`,
        title: '今天',
        subtitle: `${formatDateLabel(model.date)} · 第 ${model.week} 周${
          model.estimatedWeek ? '（推算）' : ''
        }`,
      };
    }
    return {
      kicker: 'NEXT CLASS · LOCAL',
      title: '今天',
      subtitle: '正在读取本地课表',
    };
  })();

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

  let content: ReactNode = null;
  if (page === 'settings') {
    content = (
      <SettingsPage
        status={status}
        mode={mode}
        onModeChange={setMode}
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
  } else if (page === 'schedule') {
    content = (
      <SchedulePage
        key={snapshot.term}
        snapshot={snapshot}
        today={today}
        weekLayout={weekLayout}
        archived={archived}
        intent={scheduleIntent}
        onWeekLayoutChange={setWeekLayout}
        onOpenCourse={setCourse}
        onMeta={setScheduleMeta}
      />
    );
  } else if (page === 'changes') {
    content = (
      <ChangesPage
        snapshot={snapshot}
        lastSeenId={lastSeenId}
        onSeen={markSeen}
        term={snapshot.term}
        archived={archived}
        onOpenCourse={setCourse}
        onOpenChange={setChange}
      />
    );
  } else if (archived) {
    content = (
      <TermOverview
        snapshot={snapshot}
        onOpenCourse={setCourse}
        onGoWeek={() => openSchedule({ view: 'week' })}
        onOpenChanges={() => setPage('changes')}
      />
    );
  } else {
    content = (
      <TodayPage
        snapshot={snapshot}
        now={now}
        unreadCount={unread}
        onOpenCourse={setCourse}
        onOpenChange={setChange}
        onOpenChanges={() => setPage('changes')}
        onOpenWeek={() =>
          openSchedule({ view: 'week', week: currentWeek(snapshot, today) })
        }
        onOpenDay={(week, weekday) =>
          openSchedule({ view: 'week', week, weekday })
        }
        onOpenSemester={() => openSchedule({ view: 'semester' })}
      />
    );
  }

  return (
    <>
      <AppShell
        snapshot={current}
        page={page}
        onNavigate={setPage}
        meta={meta}
        term={snapshot?.term}
        currentTerm={archive?.current_term}
        onChooseTerm={() => setTermSheet(true)}
        mode={mode}
        onModeChange={setMode}
        unreadCount={unread}
        status={status}
        syncing={syncBusy}
        onSync={handleSync}
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
      {change && (
        <ChangeDetailSheet
          change={change}
          onClose={() => setChange(null)}
          onOpenCourse={(next) => {
            setChange(null);
            setCourse(next);
          }}
        />
      )}
      {termSheet && archive && (
        <TermSheet
          archive={archive}
          selectedTerm={snapshot?.term ?? archive.current_term}
          onSelect={(term) => {
            setSelectedTerm(term);
            setCourse(null);
            setChange(null);
            setScheduleIntent(null);
            setTermSheet(false);
          }}
          onClose={() => setTermSheet(false)}
        />
      )}
    </>
  );
}

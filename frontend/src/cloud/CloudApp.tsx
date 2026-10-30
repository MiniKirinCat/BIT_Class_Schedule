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
  ThemeName,
  WeekLayout,
} from '../types';
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
  formatDateTime,
  unreadChangeCount,
  weekdayName,
} from '../lib/schedule';
import {
  defaultWeekLayout,
  readLastSeenChangeId,
  removeStorage,
  STORAGE_KEYS,
  useStoredChoice,
  writeLastSeenChangeId,
} from '../lib/storage';
import { applyTheme, THEME_NAMES } from '../lib/theme';
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
import { CloudConnect } from './CloudConnect';
import { DevicePage } from './DevicePage';
import {
  CloudLoadError,
  clearCloudState,
  loadCloudSnapshot,
  parseCloudHash,
  readCloudConfig,
  saveCloudConfig,
  type CloudConfig,
} from './protocol';

export function CloudApp() {
  const [config, setConfig] = useState<CloudConfig | null>(null);
  const [archive, setArchive] = useState<ScheduleArchive | null>(null);
  const [selectedTerm, setSelectedTerm] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState<CloudLoadError | null>(null);
  const [page, setPage] = useState<PageKey>('today');
  const [course, setCourse] = useState<CourseSession | null>(null);
  const [change, setChange] = useState<ChangeRecord | null>(null);
  const [termSheet, setTermSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
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
  const [theme, setTheme] = useStoredChoice<ThemeName>(
    STORAGE_KEYS.theme,
    'paper',
    THEME_NAMES,
  );

  useAppShortcuts({ onNavigate: setPage, cloudMode: true });

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (page !== 'schedule') setScheduleMeta(null);
  }, [page]);

  const bootstrapped = useRef(false);
  const lastLoadedAt = useRef(0);
  const loadingRef = useRef(false);

  const load = useCallback(async (target: CloudConfig) => {
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    setWarning('');
    try {
      const result = await loadCloudSnapshot(target);
      setArchive(result.archive);
      setSelectedTerm((previous) => {
        if (
          !previous ||
          !result.archive.terms.some((term) => term.term === previous)
        ) {
          return result.archive.current_term;
        }
        if (
          previous === currentTermRef.current &&
          result.archive.current_term !== previous
        ) {
          return result.archive.current_term;
        }
        return previous;
      });
      currentTermRef.current = result.archive.current_term;
      setFromCache(result.source === 'cache');
      setCachedAt(result.cachedAt);
      setWarning(result.warning);
    } catch (caught) {
      const nextError =
        caught instanceof CloudLoadError
          ? caught
          : new CloudLoadError('network', '无法获取云端快照');
      setArchive(null);
      setSelectedTerm('');
      setFromCache(false);
      setCachedAt(null);
      setError(nextError);
    } finally {
      loadingRef.current = false;
      lastLoadedAt.current = Date.now();
      setLastPullAt(new Date().toISOString());
      setLoading(false);
      setInitialized(true);
    }
  }, []);

  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const fromHash = parseCloudHash(window.location.hash);
    if (fromHash) {
      saveCloudConfig(fromHash);
      setConfig(fromHash);
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
      void load(fromHash);
      return;
    }

    if (window.location.hash) {
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}${window.location.search}`,
      );
    }

    const stored = readCloudConfig();
    if (stored) {
      setConfig(stored);
      void load(stored);
      return;
    }

    setLoading(false);
    setInitialized(true);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refreshOnFocus = () => {
      if (!config || loadingRef.current) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastLoadedAt.current < 60_000) return;
      void load(config);
    };
    document.addEventListener('visibilitychange', refreshOnFocus);
    window.addEventListener('focus', refreshOnFocus);
    return () => {
      document.removeEventListener('visibilitychange', refreshOnFocus);
      window.removeEventListener('focus', refreshOnFocus);
    };
  }, [config, load]);

  const connect = useCallback(
    (next: CloudConfig) => {
      saveCloudConfig(next);
      setConfig(next);
      setArchive(null);
      setSelectedTerm('');
      currentTermRef.current = '';
      setTermSheet(false);
      setPage('today');
      void load(next);
    },
    [load],
  );

  const disconnect = useCallback(() => {
    clearCloudState();
    for (const key of Object.values(STORAGE_KEYS)) removeStorage(key);
    setMode('workbench');
    setWeekLayout(defaultWeekLayout());
    setTheme('paper');
    setLastSeenId(0);
    setConfig(null);
    setArchive(null);
    setSelectedTerm('');
    currentTermRef.current = '';
    setTermSheet(false);
    setError(null);
    setFromCache(false);
    setCachedAt(null);
    setLastPullAt(null);
    setWarning('');
    setPage('today');
    setLoading(false);
    setInitialized(true);
  }, [setMode, setWeekLayout, setTheme]);

  const refresh = useCallback(() => {
    if (config && !loadingRef.current) void load(config);
  }, [config, load]);

  const markSeen = useCallback((id: number) => {
    setLastSeenId(id);
    writeLastSeenChangeId(id);
  }, []);

  const openSchedule = useCallback((intent: Omit<ScheduleIntent, 'nonce'>) => {
    intentNonce.current += 1;
    setScheduleIntent({ ...intent, nonce: intentNonce.current });
    setPage('schedule');
  }, []);

  if (!initialized) {
    return (
      <div className="loading-screen">
        <span className="spinner" aria-hidden="true" />
        正在读取快照…
      </div>
    );
  }

  if (!config) {
    return <CloudConnect onSubmit={connect} busy={loading} />;
  }

  if (!archive && loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" aria-hidden="true" />
        正在解密快照…
      </div>
    );
  }

  if (!archive) {
    const decryptFailure = error?.kind === 'decrypt' || error?.kind === 'format';
    return (
      <div className="setup-shell">
        <div className="setup-card">
          <p className="eyebrow">下一节 · 云端只读</p>
          <h1 className="setup-title">
            {decryptFailure ? '无法解密快照' : '暂时无法获取快照'}
          </h1>
          <p className="setup-subtitle">
            {error?.message ??
              '请检查网络后重试；如果刚重置过密钥，需要重新扫码。'}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="button button-primary"
              onClick={refresh}
            >
              重试
            </button>
            <button type="button" className="button" onClick={disconnect}>
              清除本机配对
            </button>
          </div>
          {decryptFailure && (
            <p className="form-hint">
              解密失败时不会显示旧缓存，避免把过期数据误认为最新课表。
            </p>
          )}
        </div>
      </div>
    );
  }

  const current = currentSnapshot(archive);
  const snapshot = snapshotForTerm(
    archive,
    selectedTerm || archive.current_term,
  );
  const archived = isArchivedTerm(archive, snapshot.term);
  const unread = unreadChangeCount(current.changes, lastSeenId);
  const today = dateKeyInShanghai(now);
  const model = buildTodayModel(snapshot, now);

  const meta: PageMeta = (() => {
    if (page === 'device') {
      return {
        kicker: 'DEVICE · READ ONLY',
        title: '设备',
        subtitle: '配对、缓存与离线应用壳',
      };
    }
    if (page === 'schedule' && scheduleMeta) {
      return scheduleMeta;
    }
    if (page === 'changes') {
      return {
        kicker: `SYNC DELTA · ${snapshot.changes.length} ITEMS`,
        title: '变动',
        subtitle: archived
          ? `${snapshot.term} · 历史学期只读记录`
          : '教室调整、节次调整与停课，按检测时间排序',
      };
    }
    if (page === 'today' && archived) {
      return {
        kicker: 'ARCHIVE · TERM REVIEW',
        title: '学期回顾',
        subtitle: `${snapshot.term} · 历史学期`,
      };
    }
    return {
      kicker: `WEEK ${String(model.week).padStart(2, '0')} · ${weekdayName(model.weekday)}`,
      title: '今天',
      subtitle: `${formatDateLabel(model.date)} · 第 ${model.week} 周${
        model.estimatedWeek ? '（推算）' : ''
      }`,
    };
  })();

  const banner = fromCache ? (
    <div className="cloud-banner" role="status">
      <strong>正在显示缓存快照</strong>
      <span>
        {warning || '无法连接云端。'} 快照同步于{' '}
        {formatDateTime(current.synced_at)}
        {cachedAt ? ` · 本机缓存于 ${formatDateTime(cachedAt)}` : ''}
        {lastPullAt ? ` · 本次拉取 ${formatDateTime(lastPullAt)}` : ''}
      </span>
      <button
        type="button"
        className="ghost-button"
        disabled={loading}
        onClick={refresh}
      >
        {loading ? '正在拉取…' : '重试拉取'}
      </button>
    </div>
  ) : null;

  let content: ReactNode;
  if (page === 'device') {
    content = (
      <DevicePage
        config={config}
        snapshot={current}
        termCount={archive.terms.length}
        fromCache={fromCache}
        cachedAt={cachedAt}
        lastPullAt={lastPullAt}
        mode={mode}
        weekLayout={weekLayout}
        theme={theme}
        refreshBusy={loading}
        onModeChange={setMode}
        onWeekLayoutChange={setWeekLayout}
        onThemeChange={setTheme}
        onRefresh={refresh}
        onDisconnect={disconnect}
      />
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
        cloudMode
        term={snapshot.term}
        currentTerm={archive.current_term}
        onChooseTerm={() => setTermSheet(true)}
        mode={mode}
        onModeChange={setMode}
        unreadCount={unread}
        cached={fromCache}
        banner={banner}
      >
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
      {termSheet && (
        <TermSheet
          archive={archive}
          selectedTerm={snapshot.term}
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

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type {
  CourseSession,
  ScheduleSnapshot,
  TodayLayout,
  WeekLayout,
} from '../types';
import {
  dateKeyInShanghai,
  formatDateTime,
  unreadChangeCount,
} from '../lib/schedule';
import {
  defaultWeekLayout,
  readLastSeenChangeId,
  removeStorage,
  STORAGE_KEYS,
  useStoredChoice,
  writeLastSeenChangeId,
} from '../lib/storage';
import { useTheme } from '../lib/theme';
import { AppShell } from '../shared/AppShell';
import type { PageKey } from '../shared/BottomNav';
import { StaleBadge } from '../shared/StaleBadge';
import { TodayPage } from '../shared/TodayPage';
import { WeekPage } from '../shared/week/WeekPage';
import { ChangesPage } from '../shared/changes/ChangesPage';
import { CourseDetailSheet } from '../shared/today/CourseDetailSheet';
import { LayoutSheet } from '../shared/today/LayoutSheet';
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
  const [snapshot, setSnapshot] = useState<ScheduleSnapshot | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [warning, setWarning] = useState('');
  const [error, setError] = useState<CloudLoadError | null>(null);
  const [page, setPage] = useState<PageKey>('today');
  const [course, setCourse] = useState<CourseSession | null>(null);
  const [layoutSheet, setLayoutSheet] = useState(false);
  const [now, setNow] = useState(() => new Date());
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
      setSnapshot(result.snapshot);
      setFromCache(result.source === 'cache');
      setCachedAt(result.cachedAt);
      setWarning(result.warning);
    } catch (caught) {
      const nextError =
        caught instanceof CloudLoadError
          ? caught
          : new CloudLoadError('network', '无法获取云端快照');
      setSnapshot(null);
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
      setSnapshot(null);
      setPage('today');
      void load(next);
    },
    [load],
  );

  const disconnect = useCallback(() => {
    clearCloudState();
    for (const key of Object.values(STORAGE_KEYS)) removeStorage(key);
    setTodayLayout('focus');
    setWeekLayout(defaultWeekLayout());
    setTheme('warm');
    setLastSeenId(0);
    setConfig(null);
    setSnapshot(null);
    setError(null);
    setFromCache(false);
    setCachedAt(null);
    setLastPullAt(null);
    setWarning('');
    setPage('today');
    setLoading(false);
    setInitialized(true);
  }, [setTheme, setTodayLayout, setWeekLayout]);

  const refresh = useCallback(() => {
    if (config && !loadingRef.current) void load(config);
  }, [config, load]);

  const markSeen = useCallback((id: number) => {
    setLastSeenId(id);
    writeLastSeenChangeId(id);
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

  if (!snapshot && loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" aria-hidden="true" />
        正在解密快照…
      </div>
    );
  }

  if (!snapshot) {
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

  const unread = unreadChangeCount(snapshot.changes, lastSeenId);
  const today = dateKeyInShanghai(now);
  const banner = fromCache ? (
    <div className="cloud-banner" role="status">
      <strong>正在显示缓存快照</strong>
      <span>
        {warning || '无法连接云端。'} 快照同步于 {formatDateTime(snapshot.synced_at)}
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
        snapshot={snapshot}
        fromCache={fromCache}
        cachedAt={cachedAt}
        lastPullAt={lastPullAt}
        theme={theme}
        todayLayout={todayLayout}
        weekLayout={weekLayout}
        refreshBusy={loading}
        onThemeChange={setTheme}
        onTodayLayoutChange={setTodayLayout}
        onWeekLayoutChange={setWeekLayout}
        onRefresh={refresh}
        onDisconnect={disconnect}
      />
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
        cloudMode
        statusChip={
          <StaleBadge
            snapshot={snapshot}
            cached={fromCache}
            verboseSyncTime
          />
        }
        banner={banner}
      >
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

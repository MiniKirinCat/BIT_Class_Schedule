import { useEffect, useState } from 'react';
import type { AppMode, ScheduleSnapshot, WeekLayout } from '../types';
import { formatDateTime } from '../lib/schedule';
import { maskSnapshotUrl, type CloudConfig } from './protocol';

interface DevicePageProps {
  config: CloudConfig;
  snapshot: ScheduleSnapshot;
  termCount: number;
  fromCache: boolean;
  cachedAt: string | null;
  lastPullAt: string | null;
  mode: AppMode;
  weekLayout: WeekLayout;
  refreshBusy: boolean;
  onModeChange: (mode: AppMode) => void;
  onWeekLayoutChange: (layout: WeekLayout) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function DevicePage({
  config,
  snapshot,
  termCount,
  fromCache,
  cachedAt,
  lastPullAt,
  mode,
  weekLayout,
  refreshBusy,
  onModeChange,
  onWeekLayoutChange,
  onRefresh,
  onDisconnect,
}: DevicePageProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [offlineShell, setOfflineShell] = useState<
    'ready' | 'pending' | 'unsupported'
  >('pending');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      setOfflineShell('unsupported');
      return;
    }
    let active = true;
    void navigator.serviceWorker.ready
      .then(() => {
        if (active) setOfflineShell('ready');
      })
      .catch(() => {
        if (active) setOfflineShell('pending');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="page settings-page">
      <div className="mobile-page-head">
        <div className="eyebrow">DEVICE · READ ONLY</div>
        <h1>设备</h1>
        <p className="page-sub">配对、缓存与离线应用壳</p>
      </div>

      <div className="settings-grid">
        <section className="card settings-section">
          <div className="eyebrow">SNAPSHOT</div>
          <h2>快照</h2>
          <div className="setting-row">
            <span>快照地址</span>
            <strong>{maskSnapshotUrl(config.snapshotUrl)}</strong>
          </div>
          <div className="setting-row">
            <span>Gist</span>
            <strong>{config.gistId}</strong>
          </div>
          <div className="setting-row">
            <span>解密密钥</span>
            <strong className="is-ok">已保存在本机</strong>
          </div>
          <div className="setting-row">
            <span>学期归档</span>
            <strong>
              {termCount} 个学期 · 当前 {snapshot.term}
            </strong>
          </div>
          <div className="setting-row">
            <span>离线应用壳</span>
            <strong className={offlineShell === 'ready' ? 'is-ok' : ''}>
              {offlineShell === 'ready'
                ? '已缓存，断网可打开'
                : offlineShell === 'unsupported'
                  ? '当前浏览器不支持'
                  : '首次联网加载后可用'}
            </strong>
          </div>
          <div className="setting-row">
            <span>最后同步</span>
            <strong>{formatDateTime(snapshot.synced_at)}</strong>
          </div>
          <div className="setting-row">
            <span>数据来源</span>
            <strong className={fromCache ? 'is-alert' : 'is-ok'}>
              {fromCache
                ? `缓存快照${cachedAt ? ` · 缓存于 ${formatDateTime(cachedAt)}` : ''}`
                : '云端最新快照'}
            </strong>
          </div>
          <div className="setting-row">
            <span>上次拉取</span>
            <strong>{lastPullAt ? formatDateTime(lastPullAt) : '—'}</strong>
          </div>
          <div className="settings-actions">
            <button
              type="button"
              className="button button-primary"
              disabled={refreshBusy}
              onClick={onRefresh}
            >
              {refreshBusy ? '正在拉取…' : '重新拉取'}
            </button>
          </div>
          <p className="form-hint">
            云端页面没有后台同步；电脑端发布新快照后，手动拉取或重新打开即可更新。
            拉取失败时会继续显示本机缓存，密钥错误则不会回退到旧数据。
          </p>
        </section>

        <section className="card settings-section">
          <div className="eyebrow">LAYOUT</div>
          <h2>布局</h2>
          <p className="section-note">
            桌面端可在工作台与专注之间切换；手机上始终使用单日课表与底部导航。
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className={`settings-button ${mode === 'workbench' ? 'is-active' : ''}`}
              onClick={() => onModeChange('workbench')}
            >
              工作台
            </button>
            <button
              type="button"
              className={`settings-button ${mode === 'focus' ? 'is-active' : ''}`}
              onClick={() => onModeChange('focus')}
            >
              专注
            </button>
          </div>
          <label className="form-field">
            <span className="form-label">周课表显示</span>
            <select
              className="select"
              aria-label="周课表布局"
              value={weekLayout}
              onChange={(event) =>
                onWeekLayoutChange(event.target.value as WeekLayout)
              }
            >
              <option value="grid">整周网格</option>
              <option value="list">单日列表</option>
            </select>
          </label>
        </section>

        <section className="card settings-section">
          <div className="eyebrow">LOCAL DATA</div>
          <h2>本机数据</h2>
          <p className="form-hint">
            本机保存快照地址、解密密钥、最近一次成功解密的全部学期快照，以及布局偏好。
          </p>
          <div className="settings-actions">
            <button
              type="button"
              className={`button ${confirmClear ? 'button-danger' : ''}`}
              onClick={() => {
                if (confirmClear) {
                  onDisconnect();
                } else {
                  setConfirmClear(true);
                }
              }}
            >
              {confirmClear ? '再次点击确认清除' : '清除本机数据'}
            </button>
          </div>
          <p className="form-hint">
            清除后需要重新扫描本机设置页的二维码；电脑端课表和 Gist 不受影响。
          </p>
        </section>
      </div>
    </section>
  );
}

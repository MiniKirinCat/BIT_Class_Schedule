import { useState } from 'react';
import type { ScheduleSnapshot, ThemeName, TodayLayout, WeekLayout } from '../types';
import { formatDateTime } from '../lib/schedule';
import { ThemePicker } from '../shared/ThemePicker';
import { maskSnapshotUrl, type CloudConfig } from './protocol';

interface DevicePageProps {
  config: CloudConfig;
  snapshot: ScheduleSnapshot;
  fromCache: boolean;
  cachedAt: string | null;
  lastPullAt: string | null;
  theme: ThemeName;
  todayLayout: TodayLayout;
  weekLayout: WeekLayout;
  refreshBusy: boolean;
  onThemeChange: (theme: ThemeName) => void;
  onTodayLayoutChange: (layout: TodayLayout) => void;
  onWeekLayoutChange: (layout: WeekLayout) => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}

export function DevicePage({
  config,
  snapshot,
  fromCache,
  cachedAt,
  lastPullAt,
  theme,
  todayLayout,
  weekLayout,
  refreshBusy,
  onThemeChange,
  onTodayLayoutChange,
  onWeekLayoutChange,
  onRefresh,
  onDisconnect,
}: DevicePageProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <section className="settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">云端只读</p>
          <h2 className="page-title">设备</h2>
        </div>
      </header>

      <section className="settings-section">
        <h3>快照</h3>
        <div className="settings-row">
          <span>快照地址</span>
          <span className="settings-value">{maskSnapshotUrl(config.snapshotUrl)}</span>
        </div>
        <div className="settings-row">
          <span>Gist</span>
          <span className="settings-value">{config.gistId}</span>
        </div>
        <div className="settings-row">
          <span>解密密钥</span>
          <span className="settings-value is-ok">已保存在本机</span>
        </div>
        <div className="settings-row">
          <span>最后同步</span>
          <span className="settings-value">
            {formatDateTime(snapshot.synced_at)}
          </span>
        </div>
        <div className="settings-row">
          <span>数据来源</span>
          <span className={`settings-value ${fromCache ? 'is-alert' : 'is-ok'}`}>
            {fromCache
              ? `缓存快照${cachedAt ? ` · 缓存于 ${formatDateTime(cachedAt)}` : ''}`
              : '云端最新快照'}
          </span>
        </div>
        <div className="settings-row">
          <span>上次拉取</span>
          <span className="settings-value">
            {lastPullAt ? formatDateTime(lastPullAt) : '—'}
          </span>
        </div>
        <div className="form-actions">
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

      <section className="settings-section">
        <h3>今天页布局</h3>
        <label className="form-field">
          <span className="form-label">显示方式</span>
          <select
            className="select"
            aria-label="今天页布局"
            value={todayLayout}
            onChange={(event) =>
              onTodayLayoutChange(event.target.value as TodayLayout)
            }
          >
            <option value="focus">聚焦下一节</option>
            <option value="timeline">时间轴</option>
            <option value="compact">信息密度</option>
          </select>
        </label>
        <label className="form-field">
          <span className="form-label">周课表布局</span>
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

      <section className="settings-section">
        <h3>主题</h3>
        <ThemePicker theme={theme} onChange={onThemeChange} />
      </section>

      <section className="settings-section">
        <h3>本机数据</h3>
        <p className="form-hint">
          本机保存快照地址、解密密钥、最近一次成功解密的明文快照，以及布局和主题偏好。
        </p>
        <div className="form-actions">
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
    </section>
  );
}

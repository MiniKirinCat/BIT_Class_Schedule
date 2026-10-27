import { useEffect, useState, type FormEvent } from 'react';
import type { ThemeName } from '../types';
import type { AppSettings, AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import { formatDateTime } from '../lib/schedule';

interface SettingsPageProps {
  status: AppStatus;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onRelogin: () => void;
  onSync: () => Promise<void>;
  syncBusy: boolean;
  syncError: string;
}

export function SettingsPage({
  status,
  theme,
  onThemeChange,
  onRelogin,
  onSync,
  syncBusy,
  syncError,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.settings()
      .then(setSettings)
      .catch((caught) => setError(messageFromError(caught)));
  }, []);

  async function patch(payload: { sync_interval_days?: number; push_enabled?: boolean }) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setSettings(await api.updateSettings(payload));
      setNotice('设置已保存');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function savePush(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('请输入新的 PushPlus token');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.setupPush(token.trim(), true);
      setToken('');
      setSettings(await api.settings());
      setNotice('PushPlus 已保存，测试提醒已发送');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function testNotification() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.testNotification();
      setNotice('测试提醒已发送');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  const syncStatusLabel =
    status.sync_status === 'success'
      ? '正常'
      : status.sync_status === 'anomaly'
        ? '异常'
        : status.sync_status === 'failed'
          ? '失败'
          : status.sync_status === 'running'
            ? '同步中'
            : '尚未同步';

  return (
    <section className="settings-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">本地管理端</p>
          <h2 className="page-title">设置</h2>
        </div>
      </header>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-hint">{notice}</p>}

      <section className="settings-section">
        <h3>账号</h3>
        <div className="settings-row">
          <span>学号</span>
          <span className="settings-value">{status.school_username ?? '未配置'}</span>
        </div>
        <div className="settings-row">
          <span>连接状态</span>
          <span className={`settings-value ${status.school_configured ? 'is-ok' : 'is-alert'}`}>
            {status.school_configured ? '已连接' : '需要配置'}
          </span>
        </div>
        <div className="form-actions">
          <button type="button" className="button" onClick={onRelogin}>
            重新登录
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3>同步</h3>
        <div className="settings-row">
          <span>自动同步间隔</span>
          <select
            className="select"
            style={{ maxWidth: 150 }}
            aria-label="自动同步间隔"
            value={settings?.sync_interval_days ?? 1}
            disabled={!settings || busy}
            onChange={(event) =>
              void patch({ sync_interval_days: Number(event.target.value) })
            }
          >
            <option value={1}>每 1 天</option>
            <option value={2}>每 2 天</option>
            <option value={3}>每 3 天</option>
          </select>
        </div>
        <div className="settings-row">
          <span>上次成功同步</span>
          <span className="settings-value">
            {status.last_sync_at ? formatDateTime(status.last_sync_at) : '—'}
          </span>
        </div>
        <div className="settings-row">
          <span>下次到期</span>
          <span className="settings-value">
            {status.next_due_at ? formatDateTime(status.next_due_at) : '—'}
          </span>
        </div>
        <div className="settings-row">
          <span>同步状态</span>
          <span className={`settings-value ${status.sync_status === 'failed' || status.sync_status === 'anomaly' ? 'is-alert' : 'is-ok'}`}>
            {syncStatusLabel}
          </span>
        </div>
        {status.last_error && status.last_error !== syncError && (
          <p className="form-error">{status.last_error}</p>
        )}
        {syncError && <p className="form-error">{syncError}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="button button-primary"
            disabled={syncBusy}
            onClick={() => void onSync()}
          >
            {syncBusy ? '正在同步…' : '立即同步'}
          </button>
        </div>
        <p className="form-hint">手动同步有 5 分钟冷却；电脑关机或应用未运行时不会同步。</p>
      </section>

      <section className="settings-section">
        <h3>微信提醒</h3>
        <div className="settings-row">
          <span>PushPlus</span>
          <span className={`settings-value ${settings?.push_configured ? 'is-ok' : 'is-alert'}`}>
            {settings?.push_configured ? '已配置' : '未配置'}
          </span>
        </div>
        <div className="settings-row">
          <span>变动提醒</span>
          <button
            type="button"
            className="button"
            disabled={!settings || busy}
            onClick={() => void patch({ push_enabled: !settings?.push_enabled })}
          >
            {settings?.push_enabled ? '已启用' : '已停用'}
          </button>
        </div>
        {status.notification_error && (
          <p className="form-error">{status.notification_error}</p>
        )}
        <form className="form" onSubmit={savePush}>
          <label className="form-field">
            <span className="form-label">PushPlus token</span>
            <input
              className="input"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              placeholder={settings?.push_configured ? '输入新 token 可替换' : '粘贴 PushPlus token'}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={busy}>
              保存并测试
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !settings?.push_configured}
              onClick={() => void testNotification()}
            >
              发送测试提醒
            </button>
          </div>
          <p className="form-hint">token 只保存在 Windows 凭据管理器，不会回显完整值。</p>
        </form>
      </section>

      <section className="settings-section">
        <h3>主题</h3>
        <div className="theme-picker">
          <button
            type="button"
            className={`theme-choice ${theme === 'warm' ? 'is-active' : ''}`}
            data-theme-choice="warm"
            aria-pressed={theme === 'warm'}
            onClick={() => onThemeChange('warm')}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span className="swatch-bg" />
              <span className="swatch-primary" />
              <span className="swatch-hero" />
            </span>
            暖纸
          </button>
          <button
            type="button"
            className={`theme-choice ${theme === 'fog' ? 'is-active' : ''}`}
            data-theme-choice="fog"
            aria-pressed={theme === 'fog'}
            onClick={() => onThemeChange('fog')}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span className="swatch-bg" />
              <span className="swatch-primary" />
              <span className="swatch-hero" />
            </span>
            雾蓝
          </button>
        </div>
        <p className="form-hint">深色模式始终跟随系统，不提供手动深浅开关。</p>
      </section>

      <section className="settings-section">
        <h3>关于</h3>
        <div className="settings-row">
          <span>版本</span>
          <span className="settings-value">{status.version}</span>
        </div>
        <div className="settings-row">
          <span>数据与凭据</span>
          <span className="settings-value">课表在 data 目录；密码与 token 在 Windows 凭据管理器</span>
        </div>
        <p className="form-hint">
          应用只监听 127.0.0.1。云端只读快照不是本地核心的一部分，将在后续阶段加入。
        </p>
      </section>
    </section>
  );
}

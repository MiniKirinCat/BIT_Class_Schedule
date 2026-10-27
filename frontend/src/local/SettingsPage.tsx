import { useEffect, useState, type FormEvent } from 'react';
import type { ThemeName } from '../types';
import type { AppSettings, AppStatus } from '../data/types';
import { api, messageFromError } from '../data/local';
import { formatDateTime } from '../lib/schedule';
import { ThemePicker } from '../shared/ThemePicker';

interface SettingsPageProps {
  status: AppStatus;
  theme: ThemeName;
  onThemeChange: (theme: ThemeName) => void;
  onRelogin: () => void;
  onSync: () => Promise<void>;
  onRefresh: () => Promise<void>;
  syncBusy: boolean;
  syncError: string;
}

export function SettingsPage({
  status,
  theme,
  onThemeChange,
  onRelogin,
  onSync,
  onRefresh,
  syncBusy,
  syncError,
}: SettingsPageProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [token, setToken] = useState('');
  const [cloudToken, setCloudToken] = useState('');
  const [pagesUrl, setPagesUrl] = useState(status.cloud_pages_url ?? '');
  const [gistId, setGistId] = useState('');
  const [qrVersion, setQrVersion] = useState(() => Date.now());
  const [resetArmed, setResetArmed] = useState(false);
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

  async function saveCloud(event: FormEvent) {
    event.preventDefault();
    if (!cloudToken.trim() && !status.cloud_configured) {
      setError('请输入 GitHub token');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api.setupCloud({
        token: cloudToken.trim(),
        pages_url: pagesUrl.trim(),
        gist_id: gistId.trim() || undefined,
      });
      setCloudToken('');
      setGistId('');
      setQrVersion(Date.now());
      setSettings(await api.settings());
      await onRefresh();
      setNotice(
        result.published
          ? '云端配置已保存并发布'
          : '云端配置已保存；下次同步后会发布首个快照',
      );
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function publishCloud() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.publishCloud();
      await onRefresh();
      setQrVersion(Date.now());
      setNotice('云端快照已重新发布');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function resetCloudKey() {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.resetCloudKey();
      setResetArmed(false);
      await onRefresh();
      setQrVersion(Date.now());
      setNotice('配对密钥已重置，旧二维码已失效');
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
        <h3>云端快照</h3>
        <div className="settings-row">
          <span>发布状态</span>
          <span className={`settings-value ${status.cloud_configured ? 'is-ok' : 'is-alert'}`}>
            {status.cloud_configured ? '已配置' : '未配置'}
          </span>
        </div>
        {status.cloud_gist_id && (
          <div className="settings-row">
            <span>Gist</span>
            <span className="settings-value">{status.cloud_gist_id}</span>
          </div>
        )}
        <div className="settings-row">
          <span>Pages 地址</span>
          <span className="settings-value">{status.cloud_pages_url ?? '—'}</span>
        </div>
        <div className="settings-row">
          <span>上次发布</span>
          <span className="settings-value">
            {status.cloud_last_publish_at
              ? formatDateTime(status.cloud_last_publish_at)
              : '—'}
          </span>
        </div>
        {status.cloud_last_error && (
          <p className="form-error">{status.cloud_last_error}</p>
        )}
        <form className="form" onSubmit={saveCloud}>
          <label className="form-field">
            <span className="form-label">GitHub token</span>
            <input
              className="input"
              type="password"
              value={cloudToken}
              onChange={(event) => setCloudToken(event.target.value)}
              autoComplete="off"
              placeholder={
                status.cloud_configured
                  ? '已配置，留空表示沿用'
                  : 'classic token，勾选 gist 权限'
              }
            />
          </label>
          <label className="form-field">
            <span className="form-label">GitHub Pages 地址</span>
            <input
              className="input"
              value={pagesUrl}
              onChange={(event) => setPagesUrl(event.target.value)}
              autoComplete="url"
              placeholder="https://<用户名>.github.io/<仓库名>/"
            />
          </label>
          <label className="form-field">
            <span className="form-label">已有 Gist ID（可选）</span>
            <input
              className="input"
              value={gistId}
              onChange={(event) => setGistId(event.target.value)}
              autoComplete="off"
              placeholder="留空会自动创建 secret Gist"
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={busy}>
              保存并发布
            </button>
            <button
              type="button"
              className="button"
              disabled={busy || !status.cloud_configured}
              onClick={() => void publishCloud()}
            >
              立即重新发布
            </button>
            <button
              type="button"
              className={`button ${resetArmed ? 'button-danger' : ''}`}
              disabled={busy || !status.cloud_configured}
              onClick={() => void resetCloudKey()}
            >
              {resetArmed ? '再次点击确认重置' : '重置配对密钥'}
            </button>
          </div>
          <p className="form-hint">
            token 只保存在 Windows 凭据管理器；Gist 中只有 AES-256-GCM
            密文。重置密钥后，手机需要重新扫码。
          </p>
        </form>
        {status.cloud_qr_ready ? (
          <div className="qr-card">
            <img
              className="qr-image"
              src={api.cloudQrUrl(qrVersion)}
              alt="手机配对二维码"
            />
            <p className="form-hint">
              手机扫码导入快照地址和密钥，之后可直接添加到主屏幕。
            </p>
          </div>
        ) : (
          <p className="form-hint">
            完成配置并至少发布一次后，这里会显示手机配对二维码。
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>主题</h3>
        <ThemePicker theme={theme} onChange={onThemeChange} />
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
          应用只监听 127.0.0.1。云端只读页面由 GitHub Pages 提供，不包含教务账号或
          GitHub token。
        </p>
      </section>
    </section>
  );
}

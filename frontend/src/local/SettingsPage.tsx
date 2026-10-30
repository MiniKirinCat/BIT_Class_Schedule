import { useEffect, useState, type FormEvent } from 'react';
import type { AppMode, ThemeName } from '../types';
import type {
  AppSettings,
  AppStatus,
  PreflightResult,
  StartupStatus,
  SyncRun,
  UpdateCheck,
} from '../data/types';
import { api, messageFromError } from '../data/local';
import { formatDateTime } from '../lib/schedule';
import { PreflightSummary } from '../shared/PreflightSummary';
import { ThemePicker } from '../shared/ThemePicker';

const RUN_STATUS_LABELS: Record<string, string> = {
  success: '正常',
  failed: '失败',
  anomaly: '异常',
  running: '同步中',
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: '手动',
  startup: '启动',
  scheduled: '定时',
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes} 分 ${rest} 秒` : `${minutes} 分`;
}

interface SettingsPageProps {
  status: AppStatus;
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
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
  mode,
  onModeChange,
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
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const [diagError, setDiagError] = useState('');
  const [diagNotice, setDiagNotice] = useState('');
  const [startup, setStartup] = useState<StartupStatus | null>(null);
  const [startupBusy, setStartupBusy] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [update, setUpdate] = useState<UpdateCheck | null>(null);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateError, setUpdateError] = useState('');

  useEffect(() => {
    api.settings()
      .then(setSettings)
      .catch((caught) => setError(messageFromError(caught)));
  }, []);

  useEffect(() => {
    api.syncRuns(5)
      .then((result) => setRuns(result.runs))
      .catch((caught) => setDiagError(messageFromError(caught)));
  }, [status.last_attempt_at]);

  useEffect(() => {
    api.startup()
      .then(setStartup)
      .catch((caught) => setStartupError(messageFromError(caught)));
  }, []);

  async function toggleStartup() {
    if (!startup?.supported) return;
    setStartupBusy(true);
    setStartupError('');
    try {
      setStartup(await api.updateStartup(!startup.enabled));
    } catch (caught) {
      setStartupError(messageFromError(caught));
    } finally {
      setStartupBusy(false);
    }
  }

  async function checkUpdate() {
    setUpdateBusy(true);
    setUpdateError('');
    setUpdate(null);
    try {
      setUpdate(await api.checkUpdate());
    } catch (caught) {
      setUpdateError(messageFromError(caught));
    } finally {
      setUpdateBusy(false);
    }
  }

  async function reloadRuns() {
    setDiagBusy(true);
    setDiagError('');
    setDiagNotice('');
    try {
      setRuns((await api.syncRuns(5)).runs);
    } catch (caught) {
      setDiagError(messageFromError(caught));
    } finally {
      setDiagBusy(false);
    }
  }

  async function runPreflight() {
    setDiagBusy(true);
    setDiagError('');
    setDiagNotice('');
    try {
      setPreflight(await api.preflight());
    } catch (caught) {
      setDiagError(messageFromError(caught));
    } finally {
      setDiagBusy(false);
    }
  }

  async function copyDiagnostics() {
    setDiagBusy(true);
    setDiagError('');
    setDiagNotice('');
    try {
      const report = await api.diagnostics();
      const text = JSON.stringify(report, null, 2);
      if (!navigator.clipboard?.writeText) {
        throw new Error('当前浏览器不支持自动复制，请换用 Chrome/Edge 或手动查看日志');
      }
      await navigator.clipboard.writeText(text);
      setDiagNotice('诊断信息已复制到剪贴板，未上传到任何服务器');
    } catch (caught) {
      setDiagError(messageFromError(caught));
    } finally {
      setDiagBusy(false);
    }
  }

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
      setError('请输入新的 Server酱 SendKey');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.setupNotifications(token.trim(), true);
      setToken('');
      setSettings(await api.settings());
      setNotice('Server酱 已保存，测试提醒已发送');
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
    <section className="page settings-page">
      <div className="mobile-page-head">
        <div className="eyebrow">PREFERENCES · LOCAL FIRST</div>
        <h1>设置</h1>
        <p className="page-sub">本机数据、提醒与外观</p>
      </div>

      {error && <p className="form-error">{error}</p>}
      {notice && <p className="form-hint">{notice}</p>}

      <div className="settings-grid">
        <section className="settings-section card">
          <div className="eyebrow">APPEARANCE</div>
          <h2>外观</h2>
          <p className="section-note">
            四套配色共用纸页布局与衬线标题，只会改变色彩；深色模式跟随系统。
            课程颜色保持稳定，换主题后仍能快速认出同一门课。
          </p>
          <ThemePicker value={theme} onChange={onThemeChange} />
        </section>

        <section className="settings-section card">
          <div className="eyebrow">DESKTOP LAYOUT</div>
          <h2>桌面形态</h2>
          <p className="section-note">
            工作台保留周概览、下一节和变动侧栏；专注模式收起侧栏与右侧信息，
            只留下今天的时间线。桌面模式只影响宽屏，手机端始终使用底部导航。
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
        </section>

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
        <h3>诊断</h3>
        <p className="form-hint">
          用于排查真实账号登录和同步问题。诊断信息只在本机生成，不包含学号、密码、
          SendKey、GitHub token 或快照密钥，也不会自动上传。
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={diagBusy}
            onClick={() => void runPreflight()}
          >
            {diagBusy ? '正在检查…' : '运行环境自检'}
          </button>
          <button
            type="button"
            className="button"
            disabled={diagBusy}
            onClick={() => void copyDiagnostics()}
          >
            复制诊断信息
          </button>
          <button
            type="button"
            className="button"
            disabled={diagBusy}
            onClick={() => void reloadRuns()}
          >
            刷新同步记录
          </button>
        </div>
        {diagError && <p className="form-error">{diagError}</p>}
        {diagNotice && <p className="form-hint">{diagNotice}</p>}
        {preflight && <PreflightSummary result={preflight} />}
        <div className="diag-runs">
          {runs.length === 0 ? (
            <p className="form-hint">还没有同步记录。</p>
          ) : (
            runs.map((run) => (
              <div className="diag-run" key={run.id}>
                <div className="diag-run-head">
                  <strong>{formatDateTime(run.started_at)}</strong>
                  <span className={run.status === 'failed' || run.status === 'anomaly' ? 'is-alert' : 'is-ok'}>
                    {run.status ? (RUN_STATUS_LABELS[run.status] ?? run.status) : '未知'}
                  </span>
                  <span className="muted">
                    {TRIGGER_LABELS[run.trigger] ?? run.trigger} ·{' '}
                    {formatDuration(run.duration_seconds)}
                  </span>
                </div>
                <div className="diag-run-meta">
                  {run.course_count != null && <span>课程 {run.course_count}</span>}
                  {run.change_count != null && <span>变动 {run.change_count}</span>}
                  {run.cloud_publish_status && (
                    <span>云端 {run.cloud_publish_status}</span>
                  )}
                  {run.error_code && <span>错误码 {run.error_code}</span>}
                </div>
                {run.error_message && (
                  <p className="form-error">{run.error_message}</p>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="settings-section">
        <h3>微信提醒</h3>
        <div className="settings-row">
          <span>Server酱</span>
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
            <span className="form-label">Server酱 SendKey</span>
            <input
              className="input"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              autoComplete="off"
              placeholder={
                settings?.push_configured
                  ? '输入新的 SendKey 可替换'
                  : '粘贴 SCT 开头的 SendKey'
              }
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
          <p className="form-hint">
            <a href="https://sct.ftqq.com/" target="_blank" rel="noreferrer">
              获取 Server酱 SendKey
            </a>
            。免费会员每天 5 条，测试消息也会占用额度。SendKey 只保存在 Windows
            凭据管理器，不会回显完整值。
          </p>
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
            token 只保存在 Windows 凭据管理器；Gist 中只有包含全部学期的
            AES-256-GCM 密文。重置密钥后，手机需要重新扫码。
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
              手机扫码后可查看当前与历史学期；首次加载后添加到主屏幕，之后断网也能打开。
            </p>
          </div>
        ) : (
          <p className="form-hint">
            完成配置并至少发布一次后，这里会显示手机配对二维码。
          </p>
        )}
      </section>

      <section className="settings-section">
        <h3>启动与退出</h3>
        <div className="settings-row">
          <span>开机时启动托盘</span>
          <span className={`settings-value ${startup?.enabled ? 'is-ok' : 'is-alert'}`}>
            {startup?.supported === false
              ? '仅支持 Windows'
              : startup?.enabled
                ? '已启用'
                : '未启用'}
          </span>
        </div>
        {startupError && <p className="form-error">{startupError}</p>}
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={startupBusy || !startup?.supported}
            onClick={() => void toggleStartup()}
          >
            {startupBusy
              ? '正在更新…'
              : startup?.enabled
                ? '关闭开机自启'
                : '开启开机自启'}
          </button>
        </div>
        <p className="form-hint">
          开启后会在 Windows 启动文件夹创建一个托盘快捷方式，下次登录时生效。
          托盘图标可以打开下一节、立即同步、查看日志，并直接“退出并停止服务”，
          不需要再运行停止脚本。
        </p>
      </section>

      <section className="settings-section">
        <h3>关于</h3>
        <div className="settings-row">
          <span>版本</span>
          <span className="settings-value">{status.version}</span>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={updateBusy}
            onClick={() => void checkUpdate()}
          >
            {updateBusy ? '正在检查…' : '检查更新'}
          </button>
        </div>
        <p className="form-hint">
          检查更新只读取 GitHub Releases 的公开版本信息，不会上传账号、课表或密钥，
          也不会自动下载或安装。
        </p>
        {updateError && <p className="form-error">{updateError}</p>}
        {update && (
          <div className="update-result">
            {update.status === 'error' && (
              <p className="form-error">{update.error ?? '检查更新失败'}</p>
            )}
            {update.status === 'unpublished' && (
              <p className="form-hint">
                GitHub 上还没有已发布的版本。发布安装包后，这里会显示最新版本。
              </p>
            )}
            {update.status === 'ok' && !update.update_available && (
              <p className="form-hint">已是最新版本（{update.latest_version}）。</p>
            )}
            {update.update_available && (
              <>
                <div className="settings-row">
                  <span>最新版本</span>
                  <span className="settings-value is-ok">
                    {update.latest_version}
                  </span>
                </div>
                {update.release_name && update.release_name !== update.latest_version && (
                  <div className="settings-row">
                    <span>发布名称</span>
                    <span className="settings-value">{update.release_name}</span>
                  </div>
                )}
                {update.published_at && (
                  <div className="settings-row">
                    <span>发布时间</span>
                    <span className="settings-value">
                      {formatDateTime(update.published_at)}
                    </span>
                  </div>
                )}
                {update.notes && <p className="update-notes">{update.notes}</p>}
                {update.release_url && (
                  <a
                    className="button button-primary"
                    href={update.release_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    打开发布页面
                  </a>
                )}
                <p className="form-hint">
                  下载安装包后运行即可覆盖升级，学期历史和设置会保留。
                </p>
              </>
            )}
          </div>
        )}
        <div className="settings-row">
          <span>数据与凭据</span>
          <span className="settings-value">
            课表在本机数据目录；密码与 token 在 Windows 凭据管理器
          </span>
        </div>
        <p className="form-hint">
          应用只监听 127.0.0.1。云端只读页面由 GitHub Pages 提供，不包含教务账号或
          GitHub token。
        </p>
      </section>
      </div>
    </section>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import type { CloudSetupResult, PreflightResult } from '../data/types';
import { api, messageFromError } from '../data/local';
import { PreflightSummary } from '../shared/PreflightSummary';

interface SetupWizardProps {
  onComplete: () => void | Promise<void>;
  onCancel?: () => void;
  schoolApi?: (username: string, password: string) => Promise<unknown>;
  pushApi?: (token: string, test: boolean) => Promise<unknown>;
  preflightApi?: () => Promise<PreflightResult>;
  cloudApi?: (payload: {
    token: string;
    pages_url: string;
    gist_id?: string;
  }) => Promise<CloudSetupResult>;
  cloudConfigured?: boolean;
  cloudQrReady?: boolean;
  cloudPagesUrl?: string | null;
}

type Step = 'school' | 'push' | 'cloud' | 'done';

export function SetupWizard({
  onComplete,
  onCancel,
  schoolApi = api.setupSchool,
  pushApi = api.setupNotifications,
  preflightApi = api.preflight,
  cloudApi = api.setupCloud,
  cloudConfigured = false,
  cloudQrReady = false,
  cloudPagesUrl = null,
}: SetupWizardProps) {
  const [step, setStep] = useState<Step>('school');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [cloudToken, setCloudToken] = useState('');
  const [pagesUrl, setPagesUrl] = useState(cloudPagesUrl ?? '');
  const [gistId, setGistId] = useState('');
  const [cloudResult, setCloudResult] = useState<CloudSetupResult | null>(null);
  const [qrVersion] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [preflightError, setPreflightError] = useState('');

  useEffect(() => {
    setError('');
  }, [step]);

  async function submitSchool(event: FormEvent) {
    event.preventDefault();
    if (!username.trim() || !password) {
      setError('请填写学号和密码');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await schoolApi(username.trim(), password);
      setPassword('');
      setStep('push');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function runPreflight() {
    setPreflightBusy(true);
    setPreflightError('');
    try {
      setPreflight(await preflightApi());
    } catch (caught) {
      setPreflightError(messageFromError(caught));
    } finally {
      setPreflightBusy(false);
    }
  }

  async function savePush(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('请输入 Server酱 SendKey，或点击跳过');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await pushApi(token.trim(), true);
      setToken('');
      setStep('cloud');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function saveCloud(event: FormEvent) {
    event.preventDefault();
    if (!cloudToken.trim() && !cloudConfigured) {
      setError('请输入 GitHub token，或点击跳过');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await cloudApi({
        token: cloudToken.trim(),
        pages_url: pagesUrl.trim(),
        gist_id: gistId.trim() || undefined,
      });
      setCloudResult(result);
      setCloudToken('');
      setStep('done');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  const stepIndex = step === 'school' ? 0 : step === 'push' ? 1 : step === 'cloud' ? 2 : 3;
  const qrReady = cloudResult?.qr_ready ?? cloudQrReady;

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <p className="eyebrow">下一节 · 首次配置</p>
        <div className="steps" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span
              key={index}
              className={`step-dot ${stepIndex >= index ? 'is-active' : ''}`}
            />
          ))}
        </div>

        {step === 'school' && (
          <form className="form" onSubmit={submitSchool}>
            <div>
              <h1 className="setup-title">连接教务系统</h1>
              <p className="setup-subtitle">
                账号密码只保存在 Windows 凭据管理器，不会写入数据库或上传到云端。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">学号</span>
              <input
                className="input"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                inputMode="numeric"
              />
            </label>
            <label className="form-field">
              <span className="form-label">密码</span>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? '正在连接并同步…' : '连接并同步'}
              </button>
              {onCancel && (
                <button type="button" className="button" disabled={busy} onClick={onCancel}>
                  返回
                </button>
              )}
            </div>
            <p className="form-hint">
              首次同步会读取当前学期课表；应用只监听 127.0.0.1，不会暴露到局域网。
              登录前可以先做一次环境自检。
            </p>
            <div className="preflight-box">
              <button
                type="button"
                className="ghost-button"
                disabled={busy || preflightBusy}
                onClick={() => void runPreflight()}
              >
                {preflightBusy ? '正在检查…' : '运行环境自检'}
              </button>
              {preflightError && <p className="form-error">{preflightError}</p>}
              {preflight && <PreflightSummary result={preflight} />}
            </div>
          </form>
        )}

        {step === 'push' && (
          <form className="form" onSubmit={savePush}>
            <div>
              <h1 className="setup-title">微信提醒</h1>
              <p className="setup-subtitle">
                可选。配置 Server酱 Turbo 后，课表变动会合并成一条微信消息发给你。
                免费会员每天 5 条，测试消息也会占用额度。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">Server酱 SendKey</span>
              <input
                className="input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                placeholder="粘贴 SCT 开头的 SendKey"
              />
            </label>
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? '正在发送测试…' : '保存并测试'}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setStep('cloud')}
              >
                跳过
              </button>
            </div>
            <p className="form-hint">
              <a href="https://sct.ftqq.com/" target="_blank" rel="noreferrer">
                获取 Server酱 SendKey
              </a>
              。测试提醒会立即发到微信，之后可以随时在设置页替换 SendKey。
            </p>
          </form>
        )}

        {step === 'cloud' && (
          <form className="form" onSubmit={saveCloud}>
            <div>
              <h1 className="setup-title">云端只读快照</h1>
              <p className="setup-subtitle">
                可选。课表会用 AES-256-GCM 加密后发布到 secret Gist，手机通过
                GitHub Pages 解密查看。Gist 中没有明文课表，也没有账号密码。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">GitHub token</span>
              <input
                className="input"
                type="password"
                value={cloudToken}
                onChange={(event) => setCloudToken(event.target.value)}
                autoComplete="off"
                placeholder={
                  cloudConfigured ? '已配置，留空表示沿用' : 'classic token，勾选 gist 权限'
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
            {error && <p className="form-error">{error}</p>}
            <div className="form-actions">
              <button type="submit" className="button button-primary" disabled={busy}>
                {busy ? '正在创建并发布…' : '保存并发布'}
              </button>
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => setStep('done')}
              >
                跳过
              </button>
            </div>
            <p className="form-hint">
              token 只保存在 Windows 凭据管理器。Pages 需要先按 README
              部署一次；二维码会在下一步生成。
            </p>
          </form>
        )}

        {step === 'done' && (
          <div className="form">
            <div>
              <h1 className="setup-title">配置完成</h1>
              <p className="setup-subtitle">
                打开今天页就能看到下一节课。应用运行时会按设置间隔自动同步。
              </p>
            </div>
            {cloudResult && !cloudResult.published && (
              <p className="form-hint">
                云端配置已保存；完成一次课表同步后会自动发布首个加密快照。
              </p>
            )}
            {cloudResult && !cloudResult.qr_ready && (
              <p className="form-hint">
                还没有生成二维码：请确认已填写 GitHub Pages 地址，并在设置页完成一次发布。
              </p>
            )}
            {qrReady && (
              <div className="qr-card">
                <img
                  className="qr-image"
                  src={api.cloudQrUrl(qrVersion)}
                  alt="手机配对二维码"
                />
                <p className="form-hint">
                  用手机扫描二维码导入快照地址和密钥；二维码只在本地页面显示。
                </p>
              </div>
            )}
            <div className="form-actions">
              <button
                type="button"
                className="button button-primary"
                onClick={() => void onComplete()}
              >
                开始使用
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

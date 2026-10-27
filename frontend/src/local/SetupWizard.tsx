// frontend/src/local/SetupWizard.tsx
import { useState, type FormEvent } from 'react';
import { api, messageFromError } from '../data/local';

interface SetupWizardProps {
  onComplete: () => void | Promise<void>;
  onCancel?: () => void;
  schoolApi?: (username: string, password: string) => Promise<unknown>;
  pushApi?: (token: string, test: boolean) => Promise<unknown>;
}

type Step = 'school' | 'push' | 'done';

export function SetupWizard({
  onComplete,
  onCancel,
  schoolApi = api.setupSchool,
  pushApi = api.setupPush,
}: SetupWizardProps) {
  const [step, setStep] = useState<Step>('school');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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

  async function savePush(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('请输入 PushPlus token，或点击跳过');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await pushApi(token.trim(), true);
      setToken('');
      setStep('done');
    } catch (caught) {
      setError(messageFromError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <p className="eyebrow">下一节 · 首次配置</p>
        <div className="steps" aria-hidden="true">
          <span className={`step-dot ${step !== 'school' ? 'is-active' : ''}`} />
          <span className={`step-dot ${step === 'push' || step === 'done' ? 'is-active' : ''}`} />
          <span className={`step-dot ${step === 'done' ? 'is-active' : ''}`} />
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
            </p>
          </form>
        )}

        {step === 'push' && (
          <form className="form" onSubmit={savePush}>
            <div>
              <h1 className="setup-title">微信提醒</h1>
              <p className="setup-subtitle">
                可选。配置 PushPlus 后，课表变动会合并成一条微信消息发给你。
              </p>
            </div>
            <label className="form-field">
              <span className="form-label">PushPlus token</span>
              <input
                className="input"
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
                placeholder="粘贴 PushPlus token"
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
                onClick={() => setStep('done')}
              >
                跳过
              </button>
            </div>
            <p className="form-hint">
              测试提醒会立即发到微信。之后可以随时在设置页替换 token。
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

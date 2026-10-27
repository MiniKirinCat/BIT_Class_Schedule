import { useState, type FormEvent } from 'react';
import {
  buildCloudConfig,
  gistIdFromSnapshotUrl,
  type CloudConfig,
} from './protocol';

interface CloudConnectProps {
  onSubmit: (config: CloudConfig) => void;
  busy: boolean;
}

export function CloudConnect({ onSubmit, busy }: CloudConnectProps) {
  const [snapshotUrl, setSnapshotUrl] = useState('');
  const [gistId, setGistId] = useState('');
  const [key, setKey] = useState('');
  const [formError, setFormError] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const config = buildCloudConfig(snapshotUrl, key, gistId);
    if (!config) {
      setFormError('请填写有效的快照地址和 32 字节密钥');
      return;
    }
    const resolvedGist = config.gistId || gistIdFromSnapshotUrl(config.snapshotUrl);
    if (!resolvedGist) {
      setFormError('无法识别 Gist ID，请手动填写');
      return;
    }
    setFormError('');
    onSubmit({ ...config, gistId: resolvedGist });
  }

  return (
    <div className="setup-shell">
      <div className="setup-card">
        <p className="eyebrow">下一节 · 云端只读</p>
        <div>
          <h1 className="setup-title">连接快照</h1>
          <p className="setup-subtitle">
            手机只保存快照地址和解密密钥，不接触教务账号或 GitHub token。
            扫本机设置页的二维码通常会自动完成这一步。
          </p>
        </div>
        <form className="form" onSubmit={submit}>
          <label className="form-field">
            <span className="form-label">快照地址</span>
            <input
              className="input"
              value={snapshotUrl}
              onChange={(event) => setSnapshotUrl(event.target.value)}
              autoComplete="url"
              placeholder="https://gist.githubusercontent.com/…/snapshot.enc.json"
            />
          </label>
          <label className="form-field">
            <span className="form-label">Gist ID（可选）</span>
            <input
              className="input"
              value={gistId}
              onChange={(event) => setGistId(event.target.value)}
              autoComplete="off"
              placeholder="通常可从快照地址自动识别"
            />
          </label>
          <label className="form-field">
            <span className="form-label">解密密钥</span>
            <input
              className="input"
              type="password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              autoComplete="off"
              placeholder="base64url 密钥"
            />
          </label>
          {formError && <p className="form-error">{formError}</p>}
          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={busy}>
              {busy ? '正在连接…' : '连接并拉取'}
            </button>
          </div>
          <p className="form-hint">
            密钥只保存在本机浏览器。清除站点数据后需要重新扫码。
          </p>
        </form>
      </div>
    </div>
  );
}

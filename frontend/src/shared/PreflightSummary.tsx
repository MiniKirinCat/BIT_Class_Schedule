import type { PreflightResult } from '../data/types';

interface PreflightSummaryProps {
  result: PreflightResult;
}

export function PreflightSummary({ result }: PreflightSummaryProps) {
  const mode =
    result.network.suggested === 'campus'
      ? '校园网'
      : result.network.suggested === 'webvpn'
        ? 'WebVPN'
        : result.network.suggested === 'auto'
          ? '自动'
          : '未知';

  return (
    <div className="preflight-grid" role="status">
      <span className={result.keyring.available ? 'is-ok' : 'is-alert'}>
        Windows 凭据管理器：{result.keyring.available ? '可用' : '不可用'}
      </span>
      <span className={result.network.sso.reachable ? 'is-ok' : 'is-alert'}>
        统一身份认证：{result.network.sso.reachable ? '可访问' : '不可访问'}
      </span>
      <span className={result.network.webvpn.reachable ? 'is-ok' : 'is-alert'}>
        WebVPN：{result.network.webvpn.reachable ? '可访问' : '不可访问'}
      </span>
      <span className="muted">网络判断：{mode}</span>
      {result.keyring.error && (
        <span className="is-alert">{result.keyring.error}</span>
      )}
      {result.network.sso.error && (
        <span className="is-alert">统一身份认证：{result.network.sso.error}</span>
      )}
      {result.network.webvpn.error && (
        <span className="is-alert">WebVPN：{result.network.webvpn.error}</span>
      )}
    </div>
  );
}

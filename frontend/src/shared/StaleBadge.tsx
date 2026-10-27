import type { AppStatus } from '../data/types';
import type { ScheduleSnapshot } from '../types';
import { formatDateTime } from '../lib/schedule';

interface StaleBadgeProps {
  snapshot: ScheduleSnapshot | null;
  status?: AppStatus;
  cached?: boolean;
  verboseSyncTime?: boolean;
}

export function StaleBadge({
  snapshot,
  status,
  cached = false,
  verboseSyncTime = false,
}: StaleBadgeProps) {
  if (!snapshot) {
    return <span className="status-chip">尚未同步</span>;
  }
  const ageHours = (Date.now() - new Date(snapshot.synced_at).getTime()) / 3_600_000;
  const stale = ageHours > snapshot.sync_interval_days * 24 + 24;
  const syncTime = formatDateTime(snapshot.synced_at);
  const title = [
    `最后同步：${syncTime}`,
    status ? `同步状态：${status.sync_status ?? '未知'}` : '',
    status ? `云端：${status.cloud_status}` : '',
    status?.last_error ? `错误：${status.last_error}` : '',
  ]
    .filter(Boolean)
    .join('；');

  if (status?.sync_status === 'running') {
    return <span className="status-chip" title={title}>同步中</span>;
  }
  if (status?.sync_status === 'failed' || status?.sync_status === 'anomaly') {
    return <span className="status-chip is-alert" title={title}>同步异常 · {syncTime}</span>;
  }
  if (status?.cloud_status === 'failed') {
    return <span className="status-chip is-alert" title={title}>云端未更新 · {syncTime}</span>;
  }
  if (cached) {
    return (
      <span className="status-chip is-alert" title={title}>
        缓存快照 · {syncTime}
      </span>
    );
  }
  return (
    <span
      className={`status-chip ${stale ? 'is-alert' : ''}`}
      title={title}
    >
      {stale
        ? verboseSyncTime
          ? `可能已过期 · ${syncTime}`
          : '数据可能已过期'
        : `${verboseSyncTime ? '最后同步于' : '同步于'} ${syncTime}`}
    </span>
  );
}

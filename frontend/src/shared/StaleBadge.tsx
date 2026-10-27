// frontend/src/shared/StaleBadge.tsx
import type { ScheduleSnapshot } from '../types';
import { formatDateTime } from '../lib/schedule';

export function StaleBadge({ snapshot }: { snapshot: ScheduleSnapshot | null }) {
  if (!snapshot) {
    return <span className="status-chip">尚未同步</span>;
  }
  const ageHours = (Date.now() - new Date(snapshot.synced_at).getTime()) / 3_600_000;
  const stale = ageHours > snapshot.sync_interval_days * 24 + 24;
  return (
    <span className={`status-chip ${stale ? 'is-alert' : ''}`}>
      {stale ? '数据可能已过期' : `同步于 ${formatDateTime(snapshot.synced_at)}`}
    </span>
  );
}

import { useEffect } from 'react';
import type { ChangeRecord } from '../../types';
import {
  changeTypeLabel,
  formatDateLabel,
  formatDateTime,
  groupChangesByDate,
  maxChangeId,
} from '../../lib/schedule';

interface ChangesPageProps {
  changes: ChangeRecord[];
  lastSeenId: number;
  onSeen: (id: number) => void;
  term?: string;
  archived?: boolean;
}

export function ChangesPage({
  changes,
  lastSeenId,
  onSeen,
  term,
  archived = false,
}: ChangesPageProps) {
  useEffect(() => {
    if (archived) return;
    const newest = maxChangeId(changes);
    if (newest > lastSeenId) {
      onSeen(newest);
    }
  }, [archived, changes, lastSeenId, onSeen]);

  const groups = groupChangesByDate(changes);

  return (
    <section className="changes-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {archived && term ? `${term} · 历史学期` : '最近 50 条'}
          </p>
          <h2 className="page-title">变动</h2>
        </div>
      </header>

      {changes.length === 0 ? (
        <div className="empty-state">
          <strong>还没有检测到变动</strong>
          <span>应用会自动比对课表，发现变化后显示在这里。</span>
        </div>
      ) : (
        <div className="changes-list">
          {groups.map((group) => (
            <section key={group.date}>
              <h3 className="change-group-title">{formatDateLabel(group.date)}</h3>
              <div className="change-group-items">
                {group.items.map((change) => (
                  <article className="change-item" key={change.id}>
                    <span
                      className={`change-type ${change.type === 'removed' ? 'is-removed' : ''}`}
                    >
                      {changeTypeLabel(change.type)}
                    </span>
                    <div className="change-body">
                      <div className="change-summary">{change.summary}</div>
                      <div className="change-time">{formatDateTime(change.detected_at)}</div>
                    </div>
                    {!archived && change.id > lastSeenId && (
                      <span className="unread-dot" role="status" aria-label="未读" />
                    )}
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';
import type { ChangeRecord, CourseSession, ScheduleSnapshot } from '../../types';
import {
  CHANGE_FILTERS,
  changeCategory,
  changeDetail,
  changeImpact,
  changeTypeLabel,
  sessionFromChange,
} from '../../lib/changeView';
import {
  formatDateLabel,
  formatDateTime,
  groupChangesByDate,
  maxChangeId,
} from '../../lib/schedule';
import { Icon } from '../Icon';

interface ChangesPageProps {
  snapshot: ScheduleSnapshot;
  lastSeenId: number;
  onSeen: (id: number) => void;
  term?: string;
  archived?: boolean;
  onOpenCourse: (course: CourseSession) => void;
  onOpenChange: (change: ChangeRecord) => void;
}

export function ChangesPage({
  snapshot,
  lastSeenId,
  onSeen,
  term,
  archived = false,
  onOpenCourse,
  onOpenChange,
}: ChangesPageProps) {
  const [filter, setFilter] = useState<string>('全部');
  const changes = snapshot.changes;

  useEffect(() => {
    if (archived) return;
    const newest = maxChangeId(changes);
    if (newest > lastSeenId) {
      onSeen(newest);
    }
  }, [archived, changes, lastSeenId, onSeen]);

  const filtered =
    filter === '全部'
      ? changes
      : changes.filter((change) => changeCategory(change.type) === filter);
  const groups = groupChangesByDate(filtered);
  const unread = changes.filter((change) => change.id > lastSeenId).length;
  const adjustments = changes.filter(
    (change) => change.type === 'modified',
  ).length;
  const removals = changes.filter((change) => change.type === 'removed').length;

  function openCourse(change: ChangeRecord) {
    const session =
      sessionFromChange(change.after) ?? sessionFromChange(change.before);
    if (session) onOpenCourse(session);
  }

  return (
    <section className="page changes-page">
      <div className="mobile-page-head">
        <div className="eyebrow">SYNC DELTA · {changes.length} ITEMS</div>
        <h1>变动</h1>
        <p className="page-sub">
          {archived && term
            ? `${term} · 历史学期`
            : '教室调整、节次调整与停课，按检测时间排序'}
        </p>
      </div>

      {changes.length === 0 ? (
        <div className="empty-state">
          <Icon name="changes" />
          <strong>还没有检测到变动</strong>
          <span>应用会自动比对课表，发现变化后显示在这里。</span>
        </div>
      ) : (
        <>
          <div className="change-summary">
            <strong>
              {unread > 0 ? `${unread} 项未读变动` : `${changes.length} 项变动`}
            </strong>
            <span>
              {adjustments} 项调整 · {removals} 项取消
              {archived ? ' · 历史记录只读' : ' · 同步后自动比对'}
            </span>
          </div>

          <div className="change-toolbar">
            <div className="filter-chips">
              {CHANGE_FILTERS.map((value) => {
                const count =
                  value === '全部'
                    ? changes.length
                    : changes.filter(
                        (change) => changeCategory(change.type) === value,
                      ).length;
                return (
                  <button
                    type="button"
                    key={value}
                    className={`filter-chip ${filter === value ? 'is-active' : ''}`}
                    onClick={() => setFilter(value)}
                  >
                    {value} {count}
                  </button>
                );
              })}
            </div>
            <span className="card-meta">
              同步于 {formatDateTime(snapshot.synced_at)}
            </span>
          </div>

          <div className="change-list">
            {groups.length === 0 ? (
              <div className="empty-state">
                <Icon name="changes" />
                <strong>没有此类型的变动</strong>
                <span>切换到其他分类看看。</span>
              </div>
            ) : (
              groups.map((group) => (
                <section key={group.date} className="change-group">
                  <h3 className="change-group-title">
                    {formatDateLabel(group.date)}
                  </h3>
                  <div className="change-group-items">
                    {group.items.map((change) => {
                      const course =
                        sessionFromChange(change.after) ??
                        sessionFromChange(change.before);
                      return (
                        <article
                          className={`change-card ${change.type === 'removed' ? 'is-removed' : ''}`}
                          key={change.id}
                        >
                          <div className="change-type">
                            <span>{changeTypeLabel(change.type)}</span>
                            <small>{formatDateTime(change.detected_at)}</small>
                          </div>
                          <div className="change-body">
                            <h3>{change.course_name || '课表变动'}</h3>
                            <div className="change-diff">{change.summary}</div>
                            <p>{changeDetail(change)}</p>
                          </div>
                          <div className="change-impact">
                            <span>影响时间</span>
                            <strong>{changeImpact(change)}</strong>
                            <button
                              type="button"
                              className="pill"
                              onClick={() => onOpenChange(change)}
                            >
                              查看详情
                            </button>
                            {course && (
                              <button
                                type="button"
                                className="pill"
                                onClick={() => openCourse(change)}
                              >
                                课程安排
                              </button>
                            )}
                            {!archived && change.id > lastSeenId && (
                              <span className="unread-dot" aria-label="未读" />
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}

import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseGroups, weekSpan } from '../../lib/archive';
import { changeTypeLabel } from '../../lib/changeView';
import { courseColorStyle } from '../../lib/courseColor';
import {
  formatDateTime,
  periodLabel,
  weekdayName,
} from '../../lib/schedule';

interface TermOverviewProps {
  snapshot: ScheduleSnapshot;
  onOpenCourse: (course: CourseSession) => void;
  onGoWeek: () => void;
  onOpenChanges: () => void;
}

export function TermOverview({
  snapshot,
  onOpenCourse,
  onGoWeek,
  onOpenChanges,
}: TermOverviewProps) {
  const groups = courseGroups(snapshot);
  const span = weekSpan(snapshot.courses);
  const recentChanges = snapshot.changes.slice(0, 3);

  return (
    <section className="page history-page">
      <div className="mobile-page-head">
        <div className="eyebrow">ARCHIVE · TERM REVIEW</div>
        <h1>学期回顾</h1>
        <p className="page-sub">
          {snapshot.term} · 最后同步于 {formatDateTime(snapshot.synced_at)}
        </p>
      </div>

      <div className="card history-summary">
        <div className="history-stats">
          <div>
            <strong>{groups.length}</strong>
            <span>门课程</span>
          </div>
          <div>
            <strong>{snapshot.courses.length}</strong>
            <span>次课</span>
          </div>
          <div>
            <strong>{snapshot.changes.length}</strong>
            <span>条变动</span>
          </div>
        </div>
        <p className="history-meta">
          {span ? `第 ${span.first}–${span.last} 周` : '周次未填写'} · 起始日{' '}
          {snapshot.first_day}
        </p>
        <div className="settings-actions">
          <button type="button" className="button" onClick={onGoWeek}>
            查看这个学期的课表
          </button>
          <button type="button" className="button" onClick={onOpenChanges}>
            历年变动
          </button>
        </div>
      </div>

      <div className="section-head">
        <h3 className="section-title">课程一览</h3>
        <span className="card-meta">{groups.length} 门</span>
      </div>
      <div className="history-courses">
        {groups.map((group) => {
          const first = group.sessions[0];
          return (
            <button
              key={group.key}
              type="button"
              className="history-course"
              style={courseColorStyle(group.course)}
              onClick={() => onOpenCourse(group.course)}
            >
              <span className="history-course-body">
                <strong>{group.course.course_name}</strong>
                <span>
                  {group.course.teacher || '教师待定'} ·{' '}
                  {first.room || group.course.room || '教室待定'}
                </span>
              </span>
              <span className="history-course-meta">
                {weekdayName(first.weekday)} · {periodLabel(first)}
                {group.sessions.length > 1
                  ? ` · 共 ${group.sessions.length} 次`
                  : ''}
              </span>
            </button>
          );
        })}
      </div>

      {recentChanges.length > 0 && (
        <section className="history-changes">
          <div className="section-head">
            <h3 className="section-title">最近变动</h3>
            <button type="button" className="ghost-button" onClick={onOpenChanges}>
              查看全部
            </button>
          </div>
          <div className="history-change-list">
            {recentChanges.map((change) => (
              <div className="history-change" key={change.id}>
                <span className="change-type">
                  <span>{changeTypeLabel(change.type)}</span>
                  <small>{formatDateTime(change.detected_at)}</small>
                </span>
                <div>
                  <div className="change-summary-line">{change.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseGroups, weekSpan } from '../../lib/archive';
import { courseToneStyle } from '../../lib/courseColor';
import {
  changeTypeLabel,
  formatDateTime,
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
    <section className="history-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            历史学期 · 最后同步于 {formatDateTime(snapshot.synced_at)}
          </p>
          <h2 className="page-title">学期回顾</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onGoWeek}>
          周课表
        </button>
      </header>

      <div className="history-summary">
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
      </div>

      <div className="section-head history-course-head">
        <h3 className="section-title">课程一览</h3>
        <span className="muted">{groups.length} 门</span>
      </div>
      <div className="history-courses">
        {groups.map((group) => {
          const first = group.sessions[0];
          return (
            <button
              key={group.key}
              type="button"
              className="history-course course-tone"
              style={courseToneStyle(group.course)}
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
                {weekdayName(first.weekday)} · 第 {first.start_period}-
                {first.end_period} 节
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
                  {changeTypeLabel(change.type)}
                </span>
                <div>
                  <div className="change-summary">{change.summary}</div>
                  <div className="change-time">
                    {formatDateTime(change.detected_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

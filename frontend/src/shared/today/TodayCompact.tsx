import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForDate,
  parseDateKey,
  periodTime,
  sessionKey,
  type TodayModel,
  weekDates,
  weekdayName,
} from '../../lib/schedule';
import { ChangeBanner } from './ChangeBanner';

interface TodayCompactProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  unreadCount: number;
  onOpenCourse: (course: CourseSession) => void;
  onOpenChanges: () => void;
}

export function TodayCompact({
  snapshot,
  model,
  unreadCount,
  onOpenCourse,
  onOpenChanges,
}: TodayCompactProps) {
  const dates = weekDates(snapshot.first_day, model.week);
  const next =
    model.state.kind === 'ongoing' || model.state.kind === 'upcoming'
      ? model.state.course
      : null;

  return (
    <>
      <div className="week-strip" aria-label="本周日期">
        {dates.map((date) => {
          const current = date === model.date;
          const count = coursesForDate(snapshot, date).length;
          return (
            <div
              className={`week-day ${current ? 'is-today' : ''} ${count > 0 ? 'has-course' : ''}`}
              key={date}
            >
              <span>{weekdayName(parseDateKey(date).getUTCDay() === 0 ? 7 : parseDateKey(date).getUTCDay())}</span>
              <strong>{parseDateKey(date).getUTCDate()}</strong>
            </div>
          );
        })}
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">下一节</div>
          <div className="stat-value">{next ? next.course_name : '—'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日节数</div>
          <div className="stat-value">{model.sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">变动数</div>
          <div className={`stat-value ${unreadCount > 0 ? 'is-alert' : ''}`}>
            {unreadCount}
          </div>
        </div>
      </div>

      {unreadCount > 0 && (
        <ChangeBanner count={unreadCount} onClick={onOpenChanges} />
      )}

      <div className="section-head">
        <h3 className="section-title">今天的课</h3>
        <span className="muted">{model.sessions.length} 节</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>一屏看完，今天留给别的事。</span>
        </div>
      ) : (
        <div className="course-list">
          {model.sessions.map((session) => {
            const isCurrent =
              model.state.kind === 'ongoing' && model.state.course === session;
            return (
              <button
                type="button"
                className={`course-row ${isCurrent ? 'is-current' : ''}`}
                key={sessionKey(session)}
                onClick={() => onOpenCourse(session)}
              >
                <span className="course-time">
                  {periodTime(snapshot, session.start_period).start}
                  <br />
                  {periodTime(snapshot, session.end_period).end}
                </span>
                <span className="course-main">
                  <span className="course-name">{session.course_name}</span>
                  <span className="course-meta">
                    {session.room || '教室待定'} · {session.teacher || '教师待定'}
                  </span>
                </span>
                {isCurrent && <span className="course-status">正在上</span>}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

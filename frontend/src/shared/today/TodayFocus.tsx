import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  formatCountdown,
  formatDateLabel,
  periodTime,
  sessionKey,
  type TodayModel,
  type UpcomingCourse,
} from '../../lib/schedule';

interface TodayFocusProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  now: Date;
  onOpenCourse: (course: CourseSession) => void;
  onGoWeek: () => void;
  upcoming?: UpcomingCourse | null;
}

export function TodayFocus({
  snapshot,
  model,
  now,
  onOpenCourse,
  onGoWeek,
  upcoming = null,
}: TodayFocusProps) {
  const { state } = model;
  const course =
    state.kind === 'ongoing' || state.kind === 'upcoming' ? state.course : null;

  return (
    <>
      {course ? (
        <button
          type="button"
          className="hero-card"
          onClick={() => onOpenCourse(course)}
        >
          <div className="hero-top">
            <span className="hero-label">
              {state.kind === 'ongoing' ? '正在上' : '下一节'}
            </span>
            <span className="hero-time">
              {periodTime(snapshot, course.start_period).start} –{' '}
              {periodTime(snapshot, course.end_period).end}
            </span>
          </div>
          <div className="hero-course">{course.course_name}</div>
          <div className="hero-meta">
            <span>{course.room || '教室待定'}</span>
            <span>{course.teacher || '教师待定'}</span>
          </div>
          <div className="hero-countdown">
            {state.kind === 'ongoing'
              ? `还有 ${Math.max(1, Math.ceil((state.end.getTime() - now.getTime()) / 60_000))} 分钟下课`
              : state.kind === 'upcoming'
                ? formatCountdown(state.minutesUntil)
                : ''}
          </div>
        </button>
      ) : (
        <div className="hero-card is-muted">
          <div className="hero-top">
            <span className="hero-label">
              {state.kind === 'finished' ? '今天的课结束了' : '今天没课'}
            </span>
          </div>
          <div className="hero-course">
            {state.kind === 'finished' ? '慢一点，也很好' : '留一点空白给今天'}
          </div>
          <p className="hero-meta">
            {upcoming
              ? `下一节：${formatDateLabel(upcoming.date)} ${periodTime(snapshot, upcoming.course.start_period).start} · ${upcoming.course.course_name}`
              : state.kind === 'finished'
                ? '所有课程都已结束，接下来几天暂时没有排课。'
                : '今天没有排课，接下来几天也暂时没有排课。'}
          </p>
          <div className="hero-actions">
            <button type="button" className="button" onClick={onGoWeek}>
              查看周课表
            </button>
          </div>
        </div>
      )}

      <div className="section-head">
        <h3 className="section-title">今日时间轴</h3>
        <span className="muted">{model.sessions.length} 节</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>可以打开周课表看看接下来的安排。</span>
        </div>
      ) : (
        <div className="timeline">
          {model.sessions.map((session) => {
            const isCurrent =
              state.kind === 'ongoing' && state.course === session;
            return (
              <div
                className="timeline-row"
                key={sessionKey(session)}
              >
                <div className="timeline-time">
                  {periodTime(snapshot, session.start_period).start}
                  <br />
                  {periodTime(snapshot, session.end_period).end}
                </div>
                <div className="timeline-rail">
                  <span className="timeline-dot" />
                </div>
                <button
                  type="button"
                  className={`timeline-content ${isCurrent ? 'is-current' : ''}`}
                  onClick={() => onOpenCourse(session)}
                >
                  <strong>{session.course_name}</strong>
                  <div className="course-meta">
                    {session.room || '教室待定'} · {session.teacher || '教师待定'}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

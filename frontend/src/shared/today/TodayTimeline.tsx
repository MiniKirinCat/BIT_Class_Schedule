// frontend/src/shared/today/TodayTimeline.tsx
import { Fragment } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  formatCountdown,
  periodTime,
  sessionKey,
  type TodayModel,
} from '../../lib/schedule';

interface TodayTimelineProps {
  snapshot: ScheduleSnapshot;
  model: TodayModel;
  now: Date;
  onOpenCourse: (course: CourseSession) => void;
}

export function TodayTimeline({
  snapshot,
  model,
  now,
  onOpenCourse,
}: TodayTimelineProps) {
  const { state } = model;
  const nextCourse =
    state.kind === 'ongoing' || state.kind === 'upcoming' ? state.course : null;
  const nextLabel =
    state.kind === 'ongoing'
      ? '正在上'
      : state.kind === 'upcoming'
        ? formatCountdown(state.minutesUntil)
        : state.kind === 'finished'
          ? '已结束'
          : '无课';

  return (
    <>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">下一节</div>
          <div className="stat-value">
            {nextCourse ? nextCourse.course_name : '—'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">今日节数</div>
          <div className="stat-value">{model.sessions.length}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">现在</div>
          <div className="stat-value">{nextLabel}</div>
        </div>
      </div>

      <div className="section-head">
        <h3 className="section-title">今日概览</h3>
        <span className="muted">第 {model.week} 周</span>
      </div>
      {model.sessions.length === 0 ? (
        <div className="empty-state">
          <strong>今天没有课</strong>
          <span>去周课表看看这周的安排。</span>
        </div>
      ) : (
        <div className="timeline">
          {model.sessions.map((session) => {
            const marker =
              nextCourse === session
                ? state.kind === 'ongoing'
                  ? '正在上'
                  : state.kind === 'upcoming'
                    ? `下一节 · ${formatCountdown(state.minutesUntil)}`
                    : null
                : null;
            return (
              <Fragment key={sessionKey(session)}>
                {marker && <div className="now-marker">{marker}</div>}
                <div className="timeline-row">
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
                    className={`timeline-content ${nextCourse === session ? 'is-current' : ''}`}
                    onClick={() => onOpenCourse(session)}
                  >
                    <strong>{session.course_name}</strong>
                    <div className="course-meta">
                      {session.room || '教室待定'} · {session.teacher || '教师待定'}
                    </div>
                  </button>
                </div>
              </Fragment>
            );
          })}
        </div>
      )}
      <p className="form-hint">现在时间：{now.toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false })}</p>
    </>
  );
}

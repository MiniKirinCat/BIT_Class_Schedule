import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseColorStyle } from '../../lib/courseColor';
import {
  coursesForDate,
  monthDates,
  monthSessionCount,
  monthWeekRange,
  periodLabel,
  periodTime,
  semesterWeeks,
  sessionKey,
  teacherShort,
  weekForDate,
  weekdayName,
} from '../../lib/schedule';
import { Icon } from '../Icon';

interface MonthViewProps {
  snapshot: ScheduleSnapshot;
  monthKey: string;
  selectedDate: string;
  today: string;
  onSelectDate: (date: string) => void;
  onOpenCourse: (course: CourseSession) => void;
}

export function MonthView({
  snapshot,
  monthKey,
  selectedDate,
  today,
  onSelectDate,
  onOpenCourse,
}: MonthViewProps) {
  const dates = monthDates(monthKey);
  const totalWeeks = semesterWeeks(snapshot);
  const selectedSessions = coursesForDate(snapshot, selectedDate);
  const selectedWeek = weekForDate(snapshot, selectedDate).week;

  return (
    <div className="month-layout">
      <section className="card month-card">
        <div className="month-head">
          <strong>月历</strong>
          <span className="card-meta">
            {monthSessionCount(snapshot, monthKey)} 节 · 6 周网格
          </span>
        </div>
        <div className="month-grid">
          {Array.from({ length: 7 }, (_, index) => (
            <span className="month-weekday" key={index}>
              {weekdayName(index + 1)}
            </span>
          ))}
          {dates.map((date) => {
            const outside = !date.startsWith(monthKey);
            const sessions = coursesForDate(snapshot, date);
            const week = weekForDate(snapshot, date).week;
            return (
              <button
                type="button"
                className={`month-day ${outside ? 'is-outside' : ''} ${
                  date === today ? 'is-today' : ''
                } ${date === selectedDate ? 'is-selected' : ''}`}
                key={date}
                onClick={() => onSelectDate(date)}
              >
                <span className="month-day-number">
                  {Number(date.slice(8, 10))}
                  <em>
                    {week >= 1 && week <= totalWeeks ? `W${week}` : ''}
                  </em>
                </span>
                <span className="month-events">
                  {sessions.slice(0, 3).map((session) => (
                    <span
                      className="month-event"
                      style={courseColorStyle(session)}
                      key={sessionKey(session)}
                    >
                      <i />
                      <span>{session.course_name}</span>
                    </span>
                  ))}
                  {sessions.length > 3 && (
                    <span className="month-more">+{sessions.length - 3}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="semester-note month-hint">点选日期，下方查看当天安排。</p>
      </section>

      <aside className="card day-agenda">
        <div className="agenda-head">
          <div className="agenda-date">
            <strong>{Number(selectedDate.slice(8, 10))}</strong>
            <span>
              {weekdayName(weekForDate(snapshot, selectedDate).weekday)}
              <br />
              {selectedWeek >= 1 && selectedWeek <= totalWeeks
                ? `第 ${selectedWeek} 周`
                : '学期之外'}
            </span>
          </div>
          <span className="pill">{selectedSessions.length} 节</span>
        </div>
        <div className="agenda-list">
          {selectedSessions.length === 0 ? (
            <div className="empty-state">
              <Icon name="spark" />
              <strong>这天没有课</strong>
              <span>点选其他日期查看安排。</span>
            </div>
          ) : (
            selectedSessions.map((session) => (
              <button
                type="button"
                className="agenda-item"
                key={sessionKey(session)}
                onClick={() => onOpenCourse(session)}
              >
                <span className="agenda-item-top">
                  <span className="agenda-item-time">
                    {periodTime(snapshot, session.start_period).start}–
                    {periodTime(snapshot, session.end_period).end} ·{' '}
                    {periodLabel(session)}
                  </span>
                </span>
                <strong>{session.course_name}</strong>
                <small>
                  {session.room || '教室待定'} · {teacherShort(session.teacher)}
                </small>
              </button>
            ))
          )}
        </div>
        <p className="month-agenda-hint">
          {monthWeekRange(snapshot, monthKey)} · 点击课程查看全部安排
        </p>
      </aside>
    </div>
  );
}

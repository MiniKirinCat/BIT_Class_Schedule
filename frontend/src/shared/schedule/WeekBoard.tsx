import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseColorStyle } from '../../lib/courseColor';
import {
  dateOfWeek,
  periodTime,
  sessionKey,
  weekdayName,
} from '../../lib/schedule';

interface WeekBoardProps {
  snapshot: ScheduleSnapshot;
  week: number;
  today: string;
  courses: CourseSession[];
  cancelled: CourseSession[];
  flags: Map<string, string>;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekBoard({
  snapshot,
  week,
  today,
  courses,
  cancelled,
  flags,
  onOpenCourse,
}: WeekBoardProps) {
  return (
    <div className="week-board" role="grid" aria-label={`第 ${week} 周课表`}>
      <div className="week-head">
        <div className="week-head-time" />
        {Array.from({ length: 7 }, (_, index) => {
          const date = dateOfWeek(snapshot.first_day, week, index + 1);
          return (
            <div
              className={`week-day-head ${date === today ? 'is-today' : ''}`}
              key={date}
            >
              <span>{weekdayName(index + 1)}</span>
              <strong>{Number(date.slice(8, 10))}</strong>
            </div>
          );
        })}
      </div>
      <div className="week-body">
        <div className="week-time-axis">
          {snapshot.period_times.map((period) => (
            <div
              className="time-slot"
              style={{ top: `${(period.index - 1) * 54}px` }}
              key={period.index}
            >
              <strong>{period.index}</strong>
              {period.start}
            </div>
          ))}
        </div>
        {Array.from({ length: 7 }, (_, index) => {
          const weekday = index + 1;
          const date = dateOfWeek(snapshot.first_day, week, weekday);
          const dayCourses = courses.filter(
            (course) => course.weekday === weekday,
          );
          const dayCancelled = cancelled.filter(
            (course) => course.weekday === weekday,
          );
          return (
            <div
              className={`day-column ${date === today ? 'is-today' : ''}`}
              key={date}
            >
              {dayCourses.map((course) => {
                const start = periodTime(snapshot, course.start_period).start;
                const end = periodTime(snapshot, course.end_period).end;
                const height =
                  (course.end_period - course.start_period + 1) * 54 - 6;
                return (
                  <button
                    type="button"
                    className="week-course"
                    key={sessionKey(course)}
                    data-short={height < 82 ? 'true' : undefined}
                    style={{
                      ...courseColorStyle(course),
                      top: `${(course.start_period - 1) * 54 + 3}px`,
                      height: `${height}px`,
                    }}
                    title={`${course.course_name} · ${course.room || '教室待定'}`}
                    onClick={() => onOpenCourse(course)}
                  >
                    <strong>{course.course_name}</strong>
                    <small>{course.room || '教室待定'}</small>
                    <em className="course-time-note">
                      {start}–{end}
                    </em>
                    {flags.get(sessionKey(course)) && (
                      <em className="course-change-flag">
                        {flags.get(sessionKey(course))}
                      </em>
                    )}
                  </button>
                );
              })}
              {dayCancelled.map((course) => {
                const height =
                  (course.end_period - course.start_period + 1) * 54 - 6;
                return (
                  <button
                    type="button"
                    className="week-course is-cancelled"
                    key={sessionKey(course)}
                    style={{
                      ...courseColorStyle(course),
                      top: `${(course.start_period - 1) * 54 + 3}px`,
                      height: `${height}px`,
                    }}
                    title={`${course.course_name} · 本周停课`}
                    onClick={() => onOpenCourse(course)}
                  >
                    <strong>{course.course_name}</strong>
                    <small>本周停课</small>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

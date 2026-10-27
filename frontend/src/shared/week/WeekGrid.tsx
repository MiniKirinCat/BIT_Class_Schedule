// frontend/src/shared/week/WeekGrid.tsx
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForWeek,
  sessionKey,
  weekDates,
  weekdayName,
} from '../../lib/schedule';

interface WeekGridProps {
  snapshot: ScheduleSnapshot;
  week: number;
  today: string;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekGrid({ snapshot, week, today, onOpenCourse }: WeekGridProps) {
  const dates = weekDates(snapshot.first_day, week);
  const courses = coursesForWeek(snapshot, week);

  return (
    <div className="week-grid-wrap">
      <div className="week-grid" role="grid" aria-label={`第 ${week} 周课表`}>
        <div className="week-head" style={{ gridColumn: 1, gridRow: 1 }}>节次</div>
        {dates.map((date, index) => (
          <div
            key={date}
            className={`week-head ${date === today ? 'is-today' : ''}`}
            style={{ gridColumn: index + 2, gridRow: 1 }}
          >
            <span>{weekdayName(index + 1)}</span>
            <span>{Number(date.slice(8, 10))}</span>
          </div>
        ))}
        {snapshot.period_times.map((period) => (
          <div
            className="time-cell"
            key={period.index}
            style={{ gridColumn: 1, gridRow: period.index + 1 }}
          >
            <span>{period.index}</span>
            <span>{period.start}</span>
          </div>
        ))}
        {courses.map((course) => (
          <button
            key={sessionKey(course)}
            type="button"
            className="course-block"
            style={{
              gridColumn: course.weekday + 1,
              gridRow: `${course.start_period + 1} / ${course.end_period + 2}`,
            }}
            onClick={() => onOpenCourse(course)}
          >
            <strong>{course.course_name}</strong>
            <span>{course.room || '教室待定'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

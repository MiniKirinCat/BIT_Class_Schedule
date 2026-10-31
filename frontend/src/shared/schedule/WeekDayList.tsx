import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseColorStyle } from '../../lib/courseColor';
import {
  dateOfWeek,
  formatDuration,
  periodLabel,
  periodTime,
  sessionKey,
  teacherShort,
  weekdayName,
} from '../../lib/schedule';

interface WeekDayListProps {
  snapshot: ScheduleSnapshot;
  week: number;
  weekday: number;
  today: string;
  courses: CourseSession[];
  cancelled: CourseSession[];
  flags: Map<string, string>;
  onSelectDay: (weekday: number) => void;
  onOpenCourse: (course: CourseSession) => void;
}

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

export function WeekDayList({
  snapshot,
  week,
  weekday,
  today,
  courses,
  cancelled,
  flags,
  onSelectDay,
  onOpenCourse,
}: WeekDayListProps) {
  const selectedDate = dateOfWeek(snapshot.first_day, week, weekday);
  const dayCourses = courses.filter((course) => course.weekday === weekday);
  const dayCancelled = cancelled.filter((course) => course.weekday === weekday);

  return (
    <div className="mobile-day">
      <div className="day-strip" aria-label={`第 ${week} 周日期`}>
        {Array.from({ length: 7 }, (_, index) => {
          const date = dateOfWeek(snapshot.first_day, week, index + 1);
          const daySessions = courses.filter(
            (course) => course.weekday === index + 1,
          );
          return (
            <button
              key={date}
              type="button"
              className={`day-strip-button ${
                weekday === index + 1 ? 'is-active' : ''
              } ${date === today ? 'is-today' : ''} ${
                daySessions.length > 0 ? 'has-classes' : ''
              }`}
              aria-pressed={weekday === index + 1}
              onClick={() => onSelectDay(index + 1)}
            >
              <span>{weekdayName(index + 1).replace('周', '')}</span>
              <strong>{Number(date.slice(8, 10))}</strong>
              <i />
            </button>
          );
        })}
      </div>

      <div className="eyebrow day-list-kicker">
        {new Intl.DateTimeFormat('zh-CN', {
          timeZone: 'UTC',
          month: 'long',
          day: 'numeric',
        }).format(new Date(`${selectedDate}T12:00:00Z`))}{' '}
        · {weekdayName(weekday)} · {dayCourses.length} 节
      </div>

      <div className="day-list">
        {dayCourses.length === 0 && dayCancelled.length === 0 ? (
          <div className="empty-state">
            <strong>这天没有课</strong>
            <span>留一点空白，或者去月历看看。</span>
          </div>
        ) : (
          <>
            {dayCourses.map((course, index) => {
              const previous = dayCourses[index - 1];
              const start = periodTime(snapshot, course.start_period).start;
              const end = periodTime(snapshot, course.end_period).end;
              const gap = previous
                ? clockMinutes(start) -
                  clockMinutes(
                    periodTime(snapshot, previous.end_period).end,
                  )
                : 0;
              return (
                <div key={sessionKey(course)}>
                  {gap >= 30 && (
                    <div className="day-gap">{formatDuration(gap)}空档</div>
                  )}
                  <button
                    type="button"
                    className="day-course"
                    style={courseColorStyle(course)}
                    onClick={() => onOpenCourse(course)}
                  >
                    <span className="day-course-time">
                      <strong>{start}</strong>
                      {end}
                      <br />
                      {periodLabel(course)}
                    </span>
                    <span className="day-course-main">
                      <strong>{course.course_name}</strong>
                      <small>
                        {course.room || '教室待定'} ·{' '}
                        {teacherShort(course.teacher)}
                        {flags.get(sessionKey(course))
                          ? ` · ${flags.get(sessionKey(course))}`
                          : ''}
                      </small>
                    </span>
                  </button>
                </div>
              );
            })}
            {dayCancelled.map((course) => (
              <button
                type="button"
                className="day-course is-cancelled"
                key={sessionKey(course)}
                style={courseColorStyle(course)}
                onClick={() => onOpenCourse(course)}
              >
                <span className="day-course-time">
                  <strong>
                    {periodTime(snapshot, course.start_period).start}
                  </strong>
                  {periodTime(snapshot, course.end_period).end}
                  <br />
                  {periodLabel(course)}
                </span>
                <span className="day-course-main">
                  <strong>{course.course_name}</strong>
                  <small>本周停课 · 下周恢复</small>
                </span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

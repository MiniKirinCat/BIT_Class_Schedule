import { Fragment, useEffect, useState } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  coursesForWeek,
  periodTime,
  sessionKey,
  weekDates,
  weekdayName,
  weekdayOf,
} from '../../lib/schedule';

interface WeekDayListProps {
  snapshot: ScheduleSnapshot;
  week: number;
  today: string;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekDayList({
  snapshot,
  week,
  today,
  onOpenCourse,
}: WeekDayListProps) {
  const dates = weekDates(snapshot.first_day, week);
  const [selected, setSelected] = useState(() =>
    dates.includes(today) ? today : dates[0],
  );

  useEffect(() => {
    setSelected(dates.includes(today) ? today : dates[0]);
  }, [week, today, snapshot.first_day]);

  const weekday = weekdayOf(selected);
  const sessions = coursesForWeek(snapshot, week)
    .filter((course) => course.weekday === weekday)
    .sort((a, b) => a.start_period - b.start_period);

  return (
    <>
      <div className="day-strip" aria-label={`第 ${week} 周日期`}>
        {dates.map((date) => (
          <button
            key={date}
            type="button"
            className={`day-chip ${selected === date ? 'is-selected' : ''}`}
            aria-pressed={selected === date}
            onClick={() => setSelected(date)}
          >
            {weekdayName(weekdayOf(date))}
            <strong>{Number(date.slice(8, 10))}</strong>
          </button>
        ))}
      </div>

      <div className="day-list">
        {sessions.length === 0 ? (
          <div className="empty-state">
            <strong>这一天没有课</strong>
            <span>换一天看看，或者享受这段空白。</span>
          </div>
        ) : (
          sessions.map((session, index) => {
            const previous = sessions[index - 1];
            const gapStart = previous ? previous.end_period + 1 : 1;
            const gapEnd = session.start_period - 1;
            return (
              <Fragment key={sessionKey(session)}>
                {gapEnd >= gapStart && (
                  <div className="gap-row">
                    第 {gapStart}-{gapEnd} 节 · 空档
                  </div>
                )}
                <button
                  type="button"
                  className="course-row"
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
                </button>
              </Fragment>
            );
          })
        )}
      </div>
    </>
  );
}

import type { CourseSession, ScheduleSnapshot } from '../types';
import { addDays, dateTimeFor, periodTime } from './schedule';

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function icsTimestamp(value: Date): string {
  return value
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function eventDate(
  snapshot: ScheduleSnapshot,
  course: CourseSession,
  week: number,
): string {
  return addDays(snapshot.first_day, (week - 1) * 7 + (course.weekday - 1));
}

export function buildCourseIcs(
  snapshot: ScheduleSnapshot,
  course: CourseSession,
  options: { now?: Date } = {},
): string {
  const stamp = icsTimestamp(options.now ?? new Date());
  const location = [course.campus, course.room].filter(Boolean).join(' ');
  const weeks = [...new Set(course.weeks)].sort((a, b) => a - b);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Next Class//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const week of weeks) {
    const date = eventDate(snapshot, course, week);
    const start = dateTimeFor(date, periodTime(snapshot, course.start_period).start);
    const end = dateTimeFor(date, periodTime(snapshot, course.end_period).end);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${escapeIcs(course.course_code || course.course_name)}-${week}-${course.weekday}@next-class`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsTimestamp(start)}`,
      `DTEND:${icsTimestamp(end)}`,
      `SUMMARY:${escapeIcs(course.course_name)}`,
      `LOCATION:${escapeIcs(location)}`,
      `DESCRIPTION:${escapeIcs(
        [
          course.teacher ? `教师：${course.teacher}` : '',
          `周次：第 ${week} 周`,
          course.raw_time_text ? `原始时间：${course.raw_time_text}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )}`,
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function courseIcsFilename(course: CourseSession): string {
  const base = (course.course_name || course.course_code || '课程').trim();
  const safe = base.replace(/[\\/:*?"<>|]/g, '_') || '课程';
  return `${safe}.ics`;
}

import { describe, expect, it } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { buildCourseIcs, courseIcsFilename } from '../ics';

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 3,
  end_period: 4,
  weeks: [9, 10],
  raw_time_text: '周一第3-4节{第9-10周}',
};

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '1.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [COURSE],
  changes: [],
  calendar: [],
  period_times: PERIODS,
};

describe('ICS export', () => {
  it('builds one event per teaching week in UTC', () => {
    const ics = buildCourseIcs(SNAPSHOT, COURSE, {
      now: new Date('2026-10-20T00:00:00Z'),
    });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART:20261026T015500Z');
    expect(ics).toContain('DTEND:20261026T033000Z');
    expect(ics).toContain('DTSTART:20261102T015500Z');
    expect(ics).toContain('SUMMARY:高等数学');
    expect(ics).toContain('LOCATION:良乡 A101');
    expect(ics).toContain('DTSTAMP:20261020T000000Z');
  });

  it('escapes calendar text', () => {
    const ics = buildCourseIcs(
      SNAPSHOT,
      { ...COURSE, course_name: '数学,进阶;专题', weeks: [9] },
      { now: new Date('2026-10-20T00:00:00Z') },
    );
    expect(ics).toContain('SUMMARY:数学\\,进阶\\;专题');
  });

  it('handles an empty week list', () => {
    const ics = buildCourseIcs(
      SNAPSHOT,
      { ...COURSE, weeks: [] },
      { now: new Date('2026-10-20T00:00:00Z') },
    );
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('uses a safe download filename', () => {
    expect(courseIcsFilename({ ...COURSE, course_name: '数学/进阶' })).toBe(
      '数学_进阶.ics',
    );
  });
});

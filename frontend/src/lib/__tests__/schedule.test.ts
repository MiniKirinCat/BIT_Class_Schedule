// frontend/src/lib/__tests__/schedule.test.ts
import { describe, expect, it } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import {
  buildTodayModel,
  changeDateKey,
  coursesForDate,
  formatCountdown,
  groupChangesByDate,
  unreadChangeCount,
  weekDates,
  weekForDate,
} from '../schedule';

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
  ['11:35', '12:20'],
  ['13:20', '14:05'],
  ['14:10', '14:55'],
  ['15:15', '16:00'],
  ['16:05', '16:50'],
  ['16:55', '17:40'],
  ['18:30', '19:15'],
  ['19:20', '20:05'],
  ['20:10', '20:55'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

function course(overrides: Partial<CourseSession> = {}): CourseSession {
  return {
    course_code: 'MATH101',
    course_name: '高等数学',
    teacher: '李老师',
    room: 'A101',
    campus: '良乡',
    weekday: 1,
    start_period: 1,
    end_period: 2,
    weeks: [9],
    raw_time_text: '',
    ...overrides,
  };
}

function snapshot(overrides: Partial<ScheduleSnapshot> = {}): ScheduleSnapshot {
  return {
    schema_version: 1,
    app_version: '0.1.0',
    synced_at: '2026-10-26T08:00:00+08:00',
    sync_interval_days: 1,
    term: '2026-2027-1',
    first_day: '2026-08-31',
    courses: [
      course(),
      course({
        course_code: 'PHY101',
        course_name: '大学物理',
        room: 'B202',
        start_period: 3,
        end_period: 4,
      }),
    ],
    changes: [
      {
        id: 2,
        detected_at: '2026-10-26T08:00:00+08:00',
        type: 'modified',
        course_code: 'MATH101',
        course_name: '高等数学',
        summary: '高等数学：调整 教室 A101 → B202',
        before: null,
        after: null,
      },
      {
        id: 1,
        detected_at: '2026-10-25T08:00:00+08:00',
        type: 'added',
        course_code: 'PHY101',
        course_name: '大学物理',
        summary: '新增：周一 3-4 节 大学物理',
        before: null,
        after: null,
      },
    ],
    calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
    period_times: PERIODS,
    ...overrides,
  };
}

describe('Shanghai date and week calculations', () => {
  it('uses the Asia/Shanghai date for the today view', () => {
    expect(weekForDate(snapshot(), '2026-10-26')).toEqual({
      week: 9,
      weekday: 1,
      estimated: false,
    });
  });

  it('falls back to first_day arithmetic and labels it estimated', () => {
    expect(weekForDate(snapshot({ calendar: [] }), '2026-10-26')).toEqual({
      week: 9,
      weekday: 1,
      estimated: true,
    });
  });

  it('builds Monday-to-Sunday dates for a week', () => {
    expect(weekDates('2026-08-31', 9)).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
  });
});

describe('today state', () => {
  it('reports an ongoing class', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T08:10:00+08:00'),
    );
    if (model.state.kind !== 'ongoing') throw new Error('expected ongoing');
    expect(model.state.course.course_code).toBe('MATH101');
    expect(model.sessions).toHaveLength(2);
  });

  it('reports the next class and a countdown', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T09:40:00+08:00'),
    );
    if (model.state.kind !== 'upcoming') throw new Error('expected upcoming');
    expect(model.state.course.course_code).toBe('PHY101');
    expect(model.state.minutesUntil).toBe(15);
  });

  it('reports finished after the last class', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-26T12:30:00+08:00'),
    );
    expect(model.state.kind).toBe('finished');
  });

  it('reports an empty day when no course matches the week', () => {
    const model = buildTodayModel(
      snapshot(),
      new Date('2026-10-27T09:00:00+08:00'),
    );
    expect(model.state.kind).toBe('empty');
    expect(model.sessions).toEqual([]);
  });

  it('filters courses by date and week', () => {
    expect(coursesForDate(snapshot(), '2026-10-26')).toHaveLength(2);
    expect(coursesForDate(snapshot({ courses: [course({ weeks: [8] })] }), '2026-10-26')).toHaveLength(0);
  });
});

describe('changes and formatting', () => {
  it('counts unread changes by id', () => {
    expect(unreadChangeCount(snapshot().changes, 1)).toBe(1);
    expect(unreadChangeCount(snapshot().changes, 2)).toBe(0);
  });

  it('groups changes by Shanghai date in descending order', () => {
    const groups = groupChangesByDate(snapshot().changes);
    expect(groups.map((group) => group.date)).toEqual(['2026-10-26', '2026-10-25']);
    expect(changeDateKey(snapshot().changes[0])).toBe('2026-10-26');
  });

  it('formats countdowns compactly', () => {
    expect(formatCountdown(1)).toBe('还有 1 分钟');
    expect(formatCountdown(25)).toBe('还有 25 分钟');
    expect(formatCountdown(60)).toBe('还有 1 小时');
    expect(formatCountdown(75)).toBe('还有 1 小时 15 分钟');
  });
});

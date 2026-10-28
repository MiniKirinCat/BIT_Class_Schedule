import { describe, expect, it } from 'vitest';
import type { CourseSession, ScheduleArchive } from '../../types';
import {
  courseGroups,
  currentSnapshot,
  isArchivedTerm,
  normalizeArchive,
  snapshotForTerm,
  weekSpan,
} from '../archive';

function session(
  code: string,
  name: string,
  weekday: number,
  weeks: number[],
): CourseSession {
  return {
    course_code: code,
    course_name: name,
    teacher: '李老师',
    room: 'A101',
    campus: '良乡',
    weekday,
    start_period: 1,
    end_period: 2,
    weeks,
    raw_time_text: '',
  };
}

const archive: ScheduleArchive = {
  schema_version: 2,
  app_version: '1.2.0',
  synced_at: '2026-10-27T12:00:00+08:00',
  sync_interval_days: 1,
  current_term: '2026-2027-1',
  terms: [
    {
      term: '2026-2027-1',
      first_day: '2026-09-07',
      fetched_at: '2026-10-27T12:00:00+08:00',
      courses: [session('CS101', '程序设计基础', 5, [1, 2, 3])],
      changes: [],
      calendar: [],
    },
    {
      term: '2025-2026-2',
      first_day: '2026-02-23',
      fetched_at: '2026-07-01T12:00:00+08:00',
      courses: [
        session('MATH101', '高等数学', 1, [1, 2, 16]),
        session('MATH101', '高等数学', 3, [2, 3]),
        session('PHY101', '大学物理', 3, [4, 5]),
      ],
      changes: [
        {
          id: 7,
          detected_at: '2026-06-01T12:00:00+08:00',
          type: 'modified',
          course_code: 'MATH101',
          course_name: '高等数学',
          summary: '调整教室',
          before: null,
          after: null,
        },
      ],
      calendar: [],
    },
  ],
  period_times: [{ index: 1, start: '08:00', end: '08:45' }],
  sync_status: 'success',
};

describe('term archive helpers', () => {
  it('derives a schedule view for the selected term', () => {
    const current = currentSnapshot(archive);
    expect(current.term).toBe('2026-2027-1');
    expect(current.synced_at).toBe('2026-10-27T12:00:00+08:00');

    const history = snapshotForTerm(archive, '2025-2026-2');
    expect(history.term).toBe('2025-2026-2');
    expect(history.synced_at).toBe('2026-07-01T12:00:00+08:00');
    expect(history.courses).toHaveLength(3);
    expect(history.changes[0].summary).toBe('调整教室');
    expect(isArchivedTerm(archive, history.term)).toBe(true);
    expect(isArchivedTerm(archive, current.term)).toBe(false);
  });

  it('normalizes a legacy single-snapshot response', () => {
    const legacy = snapshotForTerm(archive, '2026-2027-1');
    legacy.schema_version = 1;
    const normalized = normalizeArchive(legacy);
    expect(normalized.schema_version).toBe(2);
    expect(normalized.current_term).toBe('2026-2027-1');
    expect(normalized.terms).toHaveLength(1);
    expect(normalized.terms[0].courses).toBe(legacy.courses);
  });

  it('groups sessions by course and computes the week span', () => {
    const history = snapshotForTerm(archive, '2025-2026-2');
    const groups = courseGroups(history);
    expect(groups.map((group) => group.course.course_name)).toEqual([
      '大学物理',
      '高等数学',
    ]);
    expect(groups[1].sessions).toHaveLength(2);
    expect(groups[1].weeks).toEqual([1, 2, 3, 16]);
    expect(weekSpan(history.courses)).toEqual({ first: 1, last: 16 });
  });
});

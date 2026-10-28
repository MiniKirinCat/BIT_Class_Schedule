import type {
  CourseSession,
  ScheduleArchive,
  ScheduleSnapshot,
  TermArchive,
} from '../types';
import { compareSessions } from './schedule';

export interface CourseGroup {
  key: string;
  course: CourseSession;
  sessions: CourseSession[];
  weeks: number[];
}

export interface WeekSpan {
  first: number;
  last: number;
}

function termEntry(archive: ScheduleArchive, term: string): TermArchive {
  return (
    archive.terms.find((entry) => entry.term === term) ??
    archive.terms.find((entry) => entry.term === archive.current_term) ??
    archive.terms[0]
  );
}

export function snapshotForTerm(
  archive: ScheduleArchive,
  term: string,
): ScheduleSnapshot {
  const entry = termEntry(archive, term);
  if (!entry) {
    throw new Error('课表归档为空');
  }
  return {
    schema_version: 2,
    app_version: archive.app_version,
    synced_at: entry.fetched_at,
    sync_interval_days: archive.sync_interval_days,
    term: entry.term,
    first_day: entry.first_day,
    courses: entry.courses,
    changes: entry.changes,
    calendar: entry.calendar,
    period_times: archive.period_times,
    sync_status: archive.sync_status,
    last_attempt_at: archive.last_attempt_at,
    next_due_at: archive.next_due_at,
    cloud_status: archive.cloud_status,
    last_error: archive.last_error,
    configured: archive.configured,
  };
}

export function currentSnapshot(archive: ScheduleArchive): ScheduleSnapshot {
  return snapshotForTerm(archive, archive.current_term);
}

export function archiveFromSnapshot(snapshot: ScheduleSnapshot): ScheduleArchive {
  return {
    schema_version: 2,
    app_version: snapshot.app_version,
    synced_at: snapshot.synced_at,
    sync_interval_days: snapshot.sync_interval_days,
    current_term: snapshot.term,
    terms: [
      {
        term: snapshot.term,
        first_day: snapshot.first_day,
        fetched_at: snapshot.synced_at,
        courses: snapshot.courses,
        changes: snapshot.changes,
        calendar: snapshot.calendar,
      },
    ],
    period_times: snapshot.period_times,
    sync_status: snapshot.sync_status,
    last_attempt_at: snapshot.last_attempt_at,
    next_due_at: snapshot.next_due_at,
    cloud_status: snapshot.cloud_status,
    last_error: snapshot.last_error,
    configured: snapshot.configured,
  };
}

export function normalizeArchive(
  value: ScheduleArchive | ScheduleSnapshot,
): ScheduleArchive {
  if (
    value.schema_version === 2 &&
    'current_term' in value &&
    Array.isArray(value.terms)
  ) {
    return value as ScheduleArchive;
  }
  return archiveFromSnapshot(value as ScheduleSnapshot);
}

export function isArchivedTerm(
  archive: ScheduleArchive,
  term: string,
): boolean {
  return term !== archive.current_term;
}

export function weekSpan(courses: CourseSession[]): WeekSpan | null {
  const weeks = courses.flatMap((course) => course.weeks);
  if (weeks.length === 0) return null;
  return { first: Math.min(...weeks), last: Math.max(...weeks) };
}

export function courseGroups(snapshot: ScheduleSnapshot): CourseGroup[] {
  const groups = new Map<string, CourseSession[]>();
  for (const session of snapshot.courses) {
    const key = `${session.course_code}|${session.course_name}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(session);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .map(([key, sessions]) => {
      const sorted = [...sessions].sort(compareSessions);
      return {
        key,
        course: sorted[0],
        sessions: sorted,
        weeks: [...new Set(sorted.flatMap((session) => session.weeks))].sort(
          (a, b) => a - b,
        ),
      };
    })
    .sort(
      (a, b) =>
        a.course.course_name.localeCompare(b.course.course_name) ||
        a.course.course_code.localeCompare(b.course.course_code),
    );
}

export function termCourseCount(term: TermArchive): number {
  return new Set(
    term.courses.map((course) => `${course.course_code}|${course.course_name}`),
  ).size;
}

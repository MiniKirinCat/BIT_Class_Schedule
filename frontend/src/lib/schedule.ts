import type {
  CalendarEntry,
  ChangeRecord,
  CourseSession,
  PeriodTime,
  ScheduleSnapshot,
} from '../types';

const SHANGHAI = 'Asia/Shanghai';
const WEEKDAY_NAMES = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export interface WeekInfo {
  week: number;
  weekday: number;
  estimated: boolean;
}

export type TodayState =
  | { kind: 'ongoing'; course: CourseSession; start: Date; end: Date }
  | {
      kind: 'upcoming';
      course: CourseSession;
      start: Date;
      end: Date;
      minutesUntil: number;
    }
  | { kind: 'finished' }
  | { kind: 'empty' };

export interface TodayModel {
  date: string;
  week: number;
  weekday: number;
  estimatedWeek: boolean;
  sessions: CourseSession[];
  state: TodayState;
}

export function dateKeyInShanghai(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function parseDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

export function addDays(key: string, days: number): string {
  const date = parseDateKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDateKey(end).getTime() - parseDateKey(start).getTime()) / 86_400_000);
}

export function weekdayOf(key: string): number {
  return ((parseDateKey(key).getUTCDay() + 6) % 7) + 1;
}

export function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday] ?? '';
}

export function formatDateLabel(key: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(parseDateKey(key));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: SHANGHAI,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function weekForDate(snapshot: ScheduleSnapshot, date: string): WeekInfo {
  const direct = snapshot.calendar.find((entry) => entry.date === date);
  if (direct) {
    return { week: direct.week, weekday: direct.weekday, estimated: false };
  }
  return {
    week: Math.floor(daysBetween(snapshot.first_day, date) / 7) + 1,
    weekday: weekdayOf(date),
    estimated: true,
  };
}

export function weekDates(firstDay: string, week: number): string[] {
  const start = addDays(firstDay, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function compareSessions(a: CourseSession, b: CourseSession): number {
  return (
    a.weekday - b.weekday ||
    a.start_period - b.start_period ||
    a.course_code.localeCompare(b.course_code) ||
    a.room.localeCompare(b.room)
  );
}

export function sessionKey(session: CourseSession): string {
  return [
    session.course_code,
    session.weekday,
    session.start_period,
    session.end_period,
    session.weeks.join('.'),
    session.room,
    session.teacher,
  ].join('|');
}

export function coursesForDate(
  snapshot: ScheduleSnapshot,
  date: string,
): CourseSession[] {
  const info = weekForDate(snapshot, date);
  return snapshot.courses
    .filter((course) => course.weekday === info.weekday && course.weeks.includes(info.week))
    .sort(compareSessions);
}

export function coursesForWeek(
  snapshot: ScheduleSnapshot,
  week: number,
): CourseSession[] {
  return snapshot.courses
    .filter((course) => course.weeks.includes(week))
    .sort(compareSessions);
}

export function periodTime(snapshot: ScheduleSnapshot, index: number): PeriodTime {
  const period = snapshot.period_times.find((item) => item.index === index);
  if (!period) {
    throw new Error(`缺少第 ${index} 节的作息时间`);
  }
  return period;
}

export function dateTimeFor(date: string, clock: string): Date {
  return new Date(`${date}T${clock}:00+08:00`);
}

export function sessionStart(
  snapshot: ScheduleSnapshot,
  session: CourseSession,
  date: string,
): Date {
  return dateTimeFor(date, periodTime(snapshot, session.start_period).start);
}

export function sessionEnd(
  snapshot: ScheduleSnapshot,
  session: CourseSession,
  date: string,
): Date {
  return dateTimeFor(date, periodTime(snapshot, session.end_period).end);
}

export function buildTodayModel(
  snapshot: ScheduleSnapshot,
  now: Date,
): TodayModel {
  const date = dateKeyInShanghai(now);
  const info = weekForDate(snapshot, date);
  const sessions = coursesForDate(snapshot, date);
  const timed = sessions.map((course) => ({
    course,
    start: sessionStart(snapshot, course, date),
    end: sessionEnd(snapshot, course, date),
  }));

  const ongoing = timed.find(
    (item) => item.start.getTime() <= now.getTime() && now.getTime() < item.end.getTime(),
  );
  if (ongoing) {
    return {
      date,
      week: info.week,
      weekday: info.weekday,
      estimatedWeek: info.estimated,
      sessions,
      state: { kind: 'ongoing', ...ongoing },
    };
  }

  const upcoming = timed.find((item) => item.start.getTime() > now.getTime());
  if (upcoming) {
    const minutesUntil = Math.max(
      1,
      Math.ceil((upcoming.start.getTime() - now.getTime()) / 60_000),
    );
    return {
      date,
      week: info.week,
      weekday: info.weekday,
      estimatedWeek: info.estimated,
      sessions,
      state: { kind: 'upcoming', ...upcoming, minutesUntil },
    };
  }

  return {
    date,
    week: info.week,
    weekday: info.weekday,
    estimatedWeek: info.estimated,
    sessions,
    state: sessions.length > 0 ? { kind: 'finished' } : { kind: 'empty' },
  };
}

export function formatCountdown(minutes: number): string {
  if (minutes < 60) {
    return `还有 ${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `还有 ${hours} 小时 ${rest} 分钟` : `还有 ${hours} 小时`;
}

export function unreadChangeCount(changes: ChangeRecord[], lastSeenId: number): number {
  return changes.filter((change) => change.id > lastSeenId).length;
}

export function maxChangeId(changes: ChangeRecord[]): number {
  return changes.reduce((max, change) => Math.max(max, change.id), 0);
}

export function changeDateKey(change: ChangeRecord): string {
  return dateKeyInShanghai(new Date(change.detected_at));
}

export function groupChangesByDate(
  changes: ChangeRecord[],
): Array<{ date: string; items: ChangeRecord[] }> {
  const groups = new Map<string, ChangeRecord[]>();
  for (const change of changes) {
    const key = changeDateKey(change);
    const bucket = groups.get(key) ?? [];
    bucket.push(change);
    groups.set(key, bucket);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, items]) => ({ date, items }));
}

export function changeTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    added: '新增',
    removed: '取消',
    modified: '调整',
    term_rollover: '学期切换',
    term_start_changed: '起始日',
    empty_confirmed: '空课表',
  };
  return labels[type] ?? '变动';
}

export function currentWeek(snapshot: ScheduleSnapshot, date: string): number {
  return weekForDate(snapshot, date).week;
}

export function calendarEntryFor(
  snapshot: ScheduleSnapshot,
  date: string,
): CalendarEntry | undefined {
  return snapshot.calendar.find((entry) => entry.date === date);
}

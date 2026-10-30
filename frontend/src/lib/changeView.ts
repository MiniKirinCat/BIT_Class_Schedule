import type { ChangeRecord, CourseSession, ScheduleSnapshot } from '../types';
import {
  periodLabel,
  sessionKey,
  teacherShort,
  weekdayName,
} from './schedule';

export interface WeekChangeState {
  flags: Map<string, string>;
  cancelled: CourseSession[];
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sessionFromChange(value: unknown): CourseSession | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const courseCode = typeof source.course_code === 'string' ? source.course_code : '';
  const courseName = typeof source.course_name === 'string' ? source.course_name : '';
  const weekday = asNumber(source.weekday);
  const start = asNumber(source.start_period);
  const end = asNumber(source.end_period);
  const weeks = Array.isArray(source.weeks)
    ? source.weeks.filter((week): week is number => typeof week === 'number')
    : [];
  if (!courseCode || !courseName || !weekday || !start || !end) return null;
  return {
    course_code: courseCode,
    course_name: courseName,
    teacher: typeof source.teacher === 'string' ? source.teacher : '',
    room: typeof source.room === 'string' ? source.room : '',
    campus: typeof source.campus === 'string' ? source.campus : '',
    weekday,
    start_period: start,
    end_period: end,
    weeks,
    raw_time_text:
      typeof source.raw_time_text === 'string' ? source.raw_time_text : '',
  };
}

function flagLabel(before: CourseSession | null, after: CourseSession): string {
  if (before) {
    if (before.room !== after.room) return '教室调整';
    if (
      before.weekday !== after.weekday ||
      before.start_period !== after.start_period ||
      before.end_period !== after.end_period
    ) {
      return '时间调整';
    }
    if (before.teacher !== after.teacher) return '教师调整';
    if (before.weeks.join(',') !== after.weeks.join(',')) return '周次调整';
  }
  return '已调整';
}

export function weekChangeState(
  snapshot: ScheduleSnapshot,
  week: number,
): WeekChangeState {
  const flags = new Map<string, string>();
  const cancelled: CourseSession[] = [];
  const seen = new Set<string>();
  for (const change of snapshot.changes) {
    if (change.type === 'modified' && change.after) {
      const after = sessionFromChange(change.after);
      const before = sessionFromChange(change.before);
      if (after && after.weeks.includes(week)) {
        flags.set(sessionKey(after), flagLabel(before, after));
      }
    }
    if (change.type === 'removed' && change.before) {
      const before = sessionFromChange(change.before);
      if (!before || !before.weeks.includes(week)) continue;
      const stillScheduled = snapshot.courses.some(
        (course) =>
          course.course_code === before.course_code &&
          course.weekday === before.weekday &&
          course.start_period === before.start_period &&
          course.end_period === before.end_period &&
          course.weeks.includes(week),
      );
      const key = sessionKey(before);
      if (!stillScheduled && !seen.has(key)) {
        seen.add(key);
        cancelled.push(before);
      }
    }
  }
  return { flags, cancelled };
}

export function changeCategory(type: ChangeRecord['type']): string {
  if (type === 'added') return '新增';
  if (type === 'removed') return '取消';
  if (type === 'modified') return '调整';
  return '其他';
}

export const CHANGE_FILTERS = ['全部', '调整', '取消', '新增', '其他'] as const;

export function changeTypeLabel(type: ChangeRecord['type']): string {
  const labels: Record<string, string> = {
    added: '新增',
    removed: '取消',
    modified: '调整',
    term_rollover: '学期',
    term_start_changed: '起始日',
    empty_confirmed: '空课表',
  };
  return labels[type] ?? '变动';
}

export function changeDetail(change: ChangeRecord): string {
  const before = sessionFromChange(change.before);
  const after = sessionFromChange(change.after);
  if (change.type === 'modified' && before && after) {
    const parts: string[] = [];
    if (
      before.weekday !== after.weekday ||
      before.start_period !== after.start_period ||
      before.end_period !== after.end_period
    ) {
      parts.push(
        `时间 ${weekdayName(before.weekday)} ${periodLabel(before)} → ${weekdayName(after.weekday)} ${periodLabel(after)}`,
      );
    }
    if (before.room !== after.room) {
      parts.push(`教室 ${before.room || '未填'} → ${after.room || '未填'}`);
    }
    if (before.teacher !== after.teacher) {
      parts.push(`教师 ${before.teacher || '未填'} → ${after.teacher || '未填'}`);
    }
    if (parts.length > 0) return parts.join('；');
  }
  if (change.type === 'removed' && before) {
    return `原安排：${weekdayName(before.weekday)} ${periodLabel(before)} · ${before.room || '教室待定'}`;
  }
  if (change.type === 'added' && after) {
    return `新增安排：${weekdayName(after.weekday)} ${periodLabel(after)} · ${after.room || '教室待定'}`;
  }
  return change.summary;
}

export function changeImpact(change: ChangeRecord): string {
  const session = sessionFromChange(change.after) ?? sessionFromChange(change.before);
  if (!session) {
    if (change.type === 'term_rollover') return '学期切换';
    if (change.type === 'term_start_changed') return '学期起始日';
    return '课表整体';
  }
  const weeks =
    session.weeks.length > 0
      ? session.weeks.length > 3
        ? `第 ${Math.min(...session.weeks)}–${Math.max(...session.weeks)} 周`
        : `第 ${session.weeks.join('、')} 周`
      : '周次未填';
  return `${weeks} · ${weekdayName(session.weekday)} ${periodLabel(session)}`;
}

export function changeSessionLabel(change: ChangeRecord): string {
  const session = sessionFromChange(change.after) ?? sessionFromChange(change.before);
  if (!session) return change.course_name || '课表变动';
  return `${session.course_name} · ${teacherShort(session.teacher)}`;
}

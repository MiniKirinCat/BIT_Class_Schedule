export type TodayLayout = 'focus' | 'timeline' | 'compact';
export type WeekLayout = 'grid' | 'list';
export type ThemeName = 'warm' | 'fog';
export type SyncStatus = 'success' | 'failed' | 'anomaly' | 'running' | null;
export type CloudStatus = 'success' | 'failed' | 'skipped';

export type ChangeType =
  | 'added'
  | 'removed'
  | 'modified'
  | 'term_rollover'
  | 'term_start_changed'
  | 'empty_confirmed';

export interface PeriodTime {
  index: number;
  start: string;
  end: string;
}

export interface CourseSession {
  course_code: string;
  course_name: string;
  teacher: string;
  room: string;
  campus: string;
  weekday: number;
  start_period: number;
  end_period: number;
  weeks: number[];
  raw_time_text: string;
}

export interface CalendarEntry {
  date: string;
  week: number;
  weekday: number;
}

export interface ChangeRecord {
  id: number;
  detected_at: string;
  type: ChangeType;
  course_code: string | null;
  course_name: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export interface ScheduleSnapshot {
  schema_version: 1;
  app_version: string;
  synced_at: string;
  sync_interval_days: number;
  term: string;
  first_day: string;
  courses: CourseSession[];
  changes: ChangeRecord[];
  calendar: CalendarEntry[];
  period_times: PeriodTime[];
  sync_status?: SyncStatus;
  last_attempt_at?: string | null;
  next_due_at?: string | null;
  cloud_status?: CloudStatus;
  last_error?: string | null;
  configured?: boolean;
}

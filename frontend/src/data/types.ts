// frontend/src/data/types.ts
import type { CloudStatus, ScheduleSnapshot, SyncStatus } from '../types';

export interface AppStatus {
  configured: boolean;
  school_configured: boolean;
  school_username: string | null;
  push_configured: boolean;
  cloud_configured: boolean;
  last_sync_at: string | null;
  last_attempt_at: string | null;
  next_due_at: string | null;
  sync_status: SyncStatus;
  last_error: string | null;
  notification_error: string | null;
  cloud_status: CloudStatus;
  version: string;
}

export interface AppSettings {
  sync_interval_days: number;
  push_enabled: boolean;
  school_configured: boolean;
  push_configured: boolean;
  cloud_configured: boolean;
}

export interface SyncResult {
  status: 'success' | 'failed' | 'anomaly' | 'skipped';
  message: string;
  course_count: number;
  change_count: number;
  cloud_status: CloudStatus;
  error_code: string | null;
}

export type { ScheduleSnapshot };

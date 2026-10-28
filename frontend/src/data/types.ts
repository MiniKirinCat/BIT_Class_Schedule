import type { CloudStatus, ScheduleSnapshot, SyncStatus } from '../types';

export interface AppStatus {
  configured: boolean;
  school_configured: boolean;
  school_username: string | null;
  push_configured: boolean;
  cloud_configured: boolean;
  cloud_pages_url: string | null;
  cloud_gist_id: string | null;
  cloud_last_publish_at: string | null;
  cloud_last_error: string | null;
  cloud_qr_ready: boolean;
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
  cloud_pages_url: string | null;
  cloud_gist_id: string | null;
  cloud_last_publish_at: string | null;
  cloud_last_error: string | null;
  cloud_qr_ready: boolean;
}

export interface CloudSetupResult {
  configured: boolean;
  published: boolean;
  pages_url: string;
  gist_id: string;
  qr_ready: boolean;
}

export interface SyncResult {
  status: 'success' | 'failed' | 'anomaly' | 'skipped';
  message: string;
  course_count: number;
  change_count: number;
  cloud_status: CloudStatus;
  error_code: string | null;
}

export interface SyncRun {
  id: number;
  trigger: string;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
  status: SyncStatus;
  error_code: string | null;
  error_message: string | null;
  term: string | null;
  course_count: number | null;
  change_count: number | null;
  cloud_publish_status: CloudStatus;
}

export interface NetworkProbe {
  reachable: boolean;
  status: number | null;
  error: string | null;
}

export interface PreflightResult {
  checked_at: string;
  keyring: { available: boolean; error: string | null };
  network: {
    sso: NetworkProbe;
    webvpn: NetworkProbe;
    suggested: 'campus' | 'webvpn' | 'auto' | 'unknown';
  };
}

export interface StartupStatus {
  supported: boolean;
  enabled: boolean;
}

export interface DiagnosticsReport {
  format: string;
  version: number;
  generated_at: string;
  app_version: string;
  platform: {
    system: string;
    release: string;
    machine: string;
    python: string;
  };
  keyring: { available: boolean; error: string | null };
  settings: {
    sync_interval_days: number;
    notifications_enabled: boolean;
    notifications_configured: boolean;
    cloud_configured: boolean;
    cloud_last_publish_at: string | null;
    cloud_last_error: string | null;
    notification_last_error: string | null;
  };
  counts: { snapshots: number; changes: number };
  last_sync: SyncRun | null;
  sync_runs: SyncRun[];
  note: string;
}

export type { ScheduleSnapshot };

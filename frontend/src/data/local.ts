import type { ScheduleArchive, ScheduleSnapshot } from '../types';
import { normalizeArchive } from '../lib/archive';
import type {
  AppSettings,
  AppStatus,
  CloudSetupResult,
  DiagnosticsReport,
  PreflightResult,
  StartupStatus,
  SyncResult,
  SyncRun,
  UpdateCheck,
} from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    throw new ApiError(0, '无法连接本地服务，请确认下一节正在运行');
  }
  const payload = (await response.json().catch(() => null)) as
    | { detail?: unknown }
    | null;
  if (!response.ok) {
    const detail =
      payload && typeof payload.detail === 'string'
        ? payload.detail
        : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(response.status, detail);
  }
  return payload as T;
}

export const api = {
  status: () => request<AppStatus>('/api/status'),
  dashboard: async () =>
    normalizeArchive(
      await request<ScheduleArchive | ScheduleSnapshot>('/api/dashboard'),
    ),
  settings: () => request<AppSettings>('/api/settings'),
  updateSettings: (payload: {
    sync_interval_days?: number;
    push_enabled?: boolean;
  }) =>
    request<AppSettings>('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),
  setupSchool: (username: string, password: string) =>
    request<{ status: string; configured: boolean }>('/api/setup/school', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  setupNotifications: (token: string, test: boolean) =>
    request<{ configured: boolean; tested: boolean }>('/api/setup/notifications', {
      method: 'POST',
      body: JSON.stringify({ token, test }),
    }),
  sync: () => request<SyncResult>('/api/sync', { method: 'POST' }),
  testNotification: () =>
    request<{ status: string }>('/api/notifications/test', { method: 'POST' }),
  syncRuns: (limit = 5) =>
    request<{ runs: SyncRun[] }>(`/api/sync-runs?limit=${limit}`),
  diagnostics: () => request<DiagnosticsReport>('/api/diagnostics'),
  preflight: () =>
    request<PreflightResult>('/api/diagnostics/preflight', { method: 'POST' }),
  checkUpdate: () => request<UpdateCheck>('/api/update/check'),
  startup: () => request<StartupStatus>('/api/system/startup'),
  updateStartup: (enabled: boolean) =>
    request<StartupStatus>('/api/system/startup', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),
  setupCloud: (payload: { token: string; pages_url: string; gist_id?: string }) =>
    request<CloudSetupResult>('/api/setup/cloud', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  publishCloud: () =>
    request<{ status: string; published_at: string }>('/api/cloud/publish', {
      method: 'POST',
    }),
  resetCloudKey: () =>
    request<CloudSetupResult>('/api/cloud/reset-key', { method: 'POST' }),
  cloudQrUrl: (version: number) => `/api/setup/qr?v=${version}`,
};

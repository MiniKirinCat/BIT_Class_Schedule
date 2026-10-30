import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppStatus } from '../../data/types';
import { SettingsPage } from '../SettingsPage';

const api = vi.hoisted(() => ({
  settings: vi.fn(),
  syncRuns: vi.fn(),
  startup: vi.fn(),
  updateStartup: vi.fn(),
  checkUpdate: vi.fn(),
  preflight: vi.fn(),
  diagnostics: vi.fn(),
  setupNotifications: vi.fn(),
  setupCloud: vi.fn(),
  publishCloud: vi.fn(),
  resetCloudKey: vi.fn(),
  testNotification: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock('../../data/local', () => ({
  api,
  messageFromError: (error: unknown) =>
    error instanceof Error ? error.message : '操作失败',
}));

const STATUS: AppStatus = {
  configured: true,
  school_configured: true,
  school_username: '20250001',
  push_configured: false,
  cloud_configured: false,
  cloud_pages_url: null,
  cloud_gist_id: null,
  cloud_last_publish_at: null,
  cloud_last_error: null,
  cloud_qr_ready: false,
  last_sync_at: '2026-10-27T10:00:00+08:00',
  last_attempt_at: '2026-10-27T10:00:00+08:00',
  next_due_at: '2026-10-28T10:00:00+08:00',
  sync_status: 'success',
  last_error: null,
  notification_error: null,
  cloud_status: 'skipped',
  version: '0.1.0',
};

function renderSettings(
  theme: 'paper' | 'celadon' | 'mist' | 'plum' = 'paper',
  onThemeChange = vi.fn(),
) {
  return render(
    <SettingsPage
      status={STATUS}
      mode="workbench"
      onModeChange={vi.fn()}
      theme={theme}
      onThemeChange={onThemeChange}
      onRelogin={vi.fn()}
      onSync={vi.fn()}
      onRefresh={vi.fn()}
      syncBusy={false}
      syncError=""
    />,
  );
}

beforeEach(() => {
  api.settings.mockResolvedValue({
    sync_interval_days: 1,
    push_enabled: false,
    school_configured: true,
    push_configured: false,
    cloud_configured: false,
    cloud_pages_url: null,
    cloud_gist_id: null,
    cloud_last_publish_at: null,
    cloud_last_error: null,
    cloud_qr_ready: false,
  });
  api.syncRuns.mockResolvedValue({
    runs: [
      {
        id: 1,
        trigger: 'manual',
        started_at: '2026-10-27T10:00:00+08:00',
        finished_at: '2026-10-27T10:00:04+08:00',
        duration_seconds: 4,
        status: 'success',
        error_code: null,
        error_message: null,
        term: '2026-2027-1',
        course_count: 4,
        change_count: 1,
        cloud_publish_status: 'success',
      },
    ],
  });
  api.startup.mockResolvedValue({ supported: true, enabled: false });
  api.preflight.mockResolvedValue({
    checked_at: '2026-10-27T10:00:00+08:00',
    keyring: { available: true, error: null },
    network: {
      sso: { reachable: true, status: 200, error: null },
      webvpn: { reachable: true, status: 200, error: null },
      suggested: 'auto',
    },
  });
  api.diagnostics.mockResolvedValue({
    format: 'next-class-diagnostics',
    version: 1,
    generated_at: '2026-10-27T10:00:00+08:00',
    app_version: '0.1.0',
    platform: { system: 'Windows', release: 'test', machine: 'AMD64', python: '3.13' },
    keyring: { available: true, error: null },
    settings: {
      sync_interval_days: 1,
      notifications_enabled: false,
      notifications_configured: false,
      cloud_configured: false,
      cloud_last_publish_at: null,
      cloud_last_error: null,
      notification_last_error: null,
    },
    counts: { snapshots: 1, changes: 1 },
    last_sync: null,
    sync_runs: [],
    note: '已脱敏',
  });
  api.updateStartup.mockResolvedValue({ supported: true, enabled: true });
  api.checkUpdate.mockResolvedValue({
    status: 'ok',
    current_version: '0.1.0',
    latest_version: 'v0.2.0',
    update_available: true,
    release_url: 'https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/v0.2.0',
    release_name: 'v0.2.0',
    published_at: '2026-10-28T10:00:00Z',
    notes: '修复同步问题',
    checked_at: '2026-10-28T10:00:00+08:00',
    error: null,
  });
});

describe('Settings diagnostics and notifications', () => {
  it('offers all four color themes and reports the choice', async () => {
    const onThemeChange = vi.fn();
    renderSettings('paper', onThemeChange);
    expect(screen.getByRole('button', { name: /纸页/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: /青瓷/ }));
    expect(onThemeChange).toHaveBeenCalledWith('celadon');
    expect(screen.getByRole('button', { name: /雾蓝/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /绛陶/ })).toBeInTheDocument();
  });

  it('shows Server酱 instead of PushPlus and loads sync history', async () => {
    renderSettings();
    expect(await screen.findByText('Server酱')).toBeInTheDocument();
    expect(screen.getByText('Server酱 SendKey')).toBeInTheDocument();
    expect(screen.queryByText(/PushPlus token/)).not.toBeInTheDocument();
    expect(await screen.findByText('课程 4')).toBeInTheDocument();
  });

  it('runs preflight and copies a sanitized diagnostic report', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderSettings();
    await screen.findByText('诊断');
    await userEvent.click(screen.getByRole('button', { name: '运行环境自检' }));
    expect(await screen.findByText(/Windows 凭据管理器：可用/)).toBeInTheDocument();
    expect(screen.getByText(/统一身份认证：可访问/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '复制诊断信息' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain('next-class-diagnostics');
    expect(await screen.findByText(/诊断信息已复制/)).toBeInTheDocument();
  });

  it('toggles startup and reflects the new status', async () => {
    renderSettings();
    const button = await screen.findByRole('button', { name: '开启开机自启' });
    await userEvent.click(button);
    expect(api.updateStartup).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('button', { name: '关闭开机自启' })).toBeInTheDocument();
  });

  it('checks for a new GitHub release without offering auto-install', async () => {
    renderSettings();
    await userEvent.click(screen.getByRole('button', { name: '检查更新' }));
    expect(api.checkUpdate).toHaveBeenCalled();
    expect(await screen.findByText('v0.2.0')).toBeInTheDocument();
    expect(screen.getByText('修复同步问题')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '打开发布页面' });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/MiniKirinCat/BIT_Class_Schedule/releases/tag/v0.2.0',
    );
    expect(screen.queryByRole('button', { name: /安装更新/ })).not.toBeInTheDocument();
  });
});

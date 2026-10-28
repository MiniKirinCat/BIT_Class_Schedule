import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SetupWizard } from '../SetupWizard';

describe('SetupWizard', () => {
  it('can cancel a re-login from the school step', async () => {
    const onCancel = vi.fn();
    render(
      <SetupWizard
        onComplete={vi.fn()}
        onCancel={onCancel}
        schoolApi={vi.fn()}
        pushApi={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '返回' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('validates the school form and advances to the push step', async () => {
    const schoolApi = vi.fn().mockResolvedValue({ status: 'success' });
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={schoolApi}
        pushApi={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    expect(screen.getByText('请填写学号和密码')).toBeInTheDocument();
    expect(schoolApi).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));

    expect(await screen.findByText('微信提醒')).toBeInTheDocument();
    expect(schoolApi).toHaveBeenCalledWith('20250001', 'pw');
  });

  it('allows skipping push and completing setup', async () => {
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={vi.fn().mockResolvedValue({ status: 'success' })}
        pushApi={vi.fn()}
      />,
    );

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    await screen.findByText('微信提醒');
    await userEvent.click(screen.getByRole('button', { name: '跳过' }));
    expect(await screen.findByText('云端只读快照')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '跳过' }));
    await userEvent.click(screen.getByRole('button', { name: '开始使用' }));

    expect(onComplete).toHaveBeenCalled();
  });

  it('runs the environment preflight before login', async () => {
    const preflightApi = vi.fn().mockResolvedValue({
      checked_at: '2026-10-27T10:00:00+08:00',
      keyring: { available: true, error: null },
      network: {
        sso: { reachable: true, status: 200, error: null },
        webvpn: { reachable: false, status: null, error: 'blocked' },
        suggested: 'campus',
      },
    });
    render(
      <SetupWizard
        onComplete={vi.fn()}
        schoolApi={vi.fn()}
        pushApi={vi.fn()}
        preflightApi={preflightApi}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '运行环境自检' }));
    expect(await screen.findByText(/Windows 凭据管理器：可用/)).toBeInTheDocument();
    expect(screen.getByText(/统一身份认证：可访问/)).toBeInTheDocument();
    expect(screen.getByText(/WebVPN：不可访问/)).toBeInTheDocument();
  });

  it('saves and tests a Server酱 SendKey', async () => {
    const pushApi = vi.fn().mockResolvedValue({ configured: true, tested: true });
    const onComplete = vi.fn();
    render(
      <SetupWizard
        onComplete={onComplete}
        schoolApi={vi.fn().mockResolvedValue({ status: 'success' })}
        pushApi={pushApi}
      />,
    );

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    await screen.findByText('微信提醒');
    await userEvent.type(screen.getByLabelText('Server酱 SendKey'), 'SCTpush-token');
    await userEvent.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(pushApi).toHaveBeenCalledWith('SCTpush-token', true);
    expect(await screen.findByText('云端只读快照')).toBeInTheDocument();
  });

  it('saves cloud configuration and shows the pairing QR', async () => {
    const cloudApi = vi.fn().mockResolvedValue({
      configured: true,
      published: true,
      pages_url: 'https://alice.github.io/next-class/',
      gist_id: 'gist-1',
      qr_ready: true,
    });
    render(
      <SetupWizard
        onComplete={vi.fn()}
        schoolApi={vi.fn().mockResolvedValue({ status: 'success' })}
        pushApi={vi.fn()}
        cloudApi={cloudApi}
      />,
    );

    await userEvent.type(screen.getByLabelText('学号'), '20250001');
    await userEvent.type(screen.getByLabelText('密码'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: '连接并同步' }));
    await screen.findByText('微信提醒');
    await userEvent.click(screen.getByRole('button', { name: '跳过' }));
    await screen.findByText('云端只读快照');
    await userEvent.type(screen.getByLabelText('GitHub token'), 'ghp-token');
    await userEvent.type(
      screen.getByLabelText('GitHub Pages 地址'),
      'https://alice.github.io/next-class/',
    );
    await userEvent.click(screen.getByRole('button', { name: '保存并发布' }));

    expect(cloudApi).toHaveBeenCalledWith({
      token: 'ghp-token',
      pages_url: 'https://alice.github.io/next-class/',
      gist_id: undefined,
    });
    expect(await screen.findByText('配置完成')).toBeInTheDocument();
    expect(screen.getByAltText('手机配对二维码')).toBeInTheDocument();
  });
});

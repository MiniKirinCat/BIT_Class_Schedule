// frontend/src/local/__tests__/setup.test.tsx
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
    await userEvent.click(screen.getByRole('button', { name: '开始使用' }));

    expect(onComplete).toHaveBeenCalled();
  });

  it('saves and tests a PushPlus token', async () => {
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
    await userEvent.type(screen.getByLabelText('PushPlus token'), 'push-token');
    await userEvent.click(screen.getByRole('button', { name: '保存并测试' }));

    expect(pushApi).toHaveBeenCalledWith('push-token', true);
    expect(await screen.findByText('配置完成')).toBeInTheDocument();
  });
});

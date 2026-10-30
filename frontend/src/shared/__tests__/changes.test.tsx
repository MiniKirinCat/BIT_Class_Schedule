import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeRecord, ScheduleSnapshot } from '../../types';
import { ChangesPage } from '../changes/ChangesPage';

const CHANGES: ChangeRecord[] = [
  {
    id: 2,
    detected_at: '2026-10-26T08:00:00+08:00',
    type: 'modified',
    course_code: 'MATH101',
    course_name: '高等数学',
    summary: '高等数学：调整 教室 A101 → B202',
    before: null,
    after: null,
  },
  {
    id: 1,
    detected_at: '2026-10-25T08:00:00+08:00',
    type: 'added',
    course_code: 'PHY101',
    course_name: '大学物理',
    summary: '新增：周一 3-4 节 大学物理',
    before: null,
    after: null,
  },
];

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '0.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [],
  changes: CHANGES,
  calendar: [],
  period_times: [],
};

function renderChanges(
  options: { changes?: ChangeRecord[]; lastSeenId?: number } = {},
) {
  const onSeen = vi.fn();
  const onOpenCourse = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <ChangesPage
      snapshot={{
        ...SNAPSHOT,
        changes: options.changes ?? CHANGES,
      }}
      lastSeenId={options.lastSeenId ?? 0}
      onSeen={onSeen}
      onOpenCourse={onOpenCourse}
      onOpenChange={onOpenChange}
    />,
  );
  return { onSeen, onOpenCourse, onOpenChange };
}

describe('Changes page', () => {
  it('groups changes by date and marks the page read', () => {
    const { onSeen } = renderChanges();
    expect(screen.getByText('10月26日周一')).toBeInTheDocument();
    expect(screen.getAllByText('调整').length).toBeGreaterThan(0);
    expect(onSeen).toHaveBeenCalledWith(2);
  });

  it('shows unread dots only for unseen changes', () => {
    renderChanges({ lastSeenId: 1 });
    expect(screen.getAllByLabelText('未读')).toHaveLength(1);
  });

  it('filters by change category', async () => {
    renderChanges();
    await userEvent.click(screen.getByRole('button', { name: /新增 1/ }));
    expect(screen.getByText('大学物理')).toBeInTheDocument();
    expect(screen.queryByText('高等数学')).not.toBeInTheDocument();
  });

  it('opens a change detail sheet', async () => {
    const { onOpenChange } = renderChanges();
    await userEvent.click(
      screen.getAllByRole('button', { name: '查看详情' })[0],
    );
    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2 }),
    );
  });

  it('renders the empty state', () => {
    renderChanges({ changes: [] });
    expect(screen.getByText('还没有检测到变动')).toBeInTheDocument();
  });
});

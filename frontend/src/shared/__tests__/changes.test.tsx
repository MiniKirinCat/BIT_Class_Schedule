import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ChangeRecord } from '../../types';
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

describe('Changes page', () => {
  it('groups changes by date and marks the page read', () => {
    const onSeen = vi.fn();
    render(<ChangesPage changes={CHANGES} lastSeenId={0} onSeen={onSeen} />);
    expect(screen.getByText('10月26日周一')).toBeInTheDocument();
    expect(screen.getByText('调整')).toBeInTheDocument();
    expect(onSeen).toHaveBeenCalledWith(2);
  });

  it('shows unread dots only for unseen changes', () => {
    render(<ChangesPage changes={CHANGES} lastSeenId={1} onSeen={vi.fn()} />);
    expect(screen.getAllByLabelText('未读')).toHaveLength(1);
  });

  it('renders the empty state', () => {
    render(<ChangesPage changes={[]} lastSeenId={0} onSeen={vi.fn()} />);
    expect(screen.getByText('还没有检测到变动')).toBeInTheDocument();
  });
});

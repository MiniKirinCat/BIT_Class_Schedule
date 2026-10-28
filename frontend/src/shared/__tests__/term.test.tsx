import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScheduleArchive, ScheduleSnapshot } from '../../types';
import { snapshotForTerm } from '../../lib/archive';
import { TermSheet } from '../TermSheet';
import { TermOverview } from '../history/TermOverview';

const ARCHIVE: ScheduleArchive = {
  schema_version: 2,
  app_version: '1.2.0',
  synced_at: '2026-10-27T12:00:00+08:00',
  sync_interval_days: 1,
  current_term: '2026-2027-1',
  terms: [
    {
      term: '2026-2027-1',
      first_day: '2026-09-07',
      fetched_at: '2026-10-27T12:00:00+08:00',
      courses: [],
      changes: [],
      calendar: [],
    },
    {
      term: '2025-2026-2',
      first_day: '2026-02-23',
      fetched_at: '2026-07-01T12:00:00+08:00',
      courses: [
        {
          course_code: 'HIST101',
          course_name: '历史测试课',
          teacher: '历史老师',
          room: '文科楼 101',
          campus: '良乡',
          weekday: 2,
          start_period: 3,
          end_period: 4,
          weeks: [1, 2],
          raw_time_text: '',
        },
        {
          course_code: 'HIST101',
          course_name: '历史测试课',
          teacher: '历史老师',
          room: '文科楼 102',
          campus: '良乡',
          weekday: 4,
          start_period: 3,
          end_period: 4,
          weeks: [3],
          raw_time_text: '',
        },
      ],
      changes: [
        {
          id: 3,
          detected_at: '2026-03-01T12:00:00+08:00',
          type: 'added',
          course_code: 'HIST101',
          course_name: '历史测试课',
          summary: '新增：周二 3-4 节 历史测试课',
          before: null,
          after: null,
        },
      ],
      calendar: [],
    },
  ],
  period_times: [
    { index: 1, start: '08:00', end: '08:45' },
    { index: 3, start: '09:55', end: '10:40' },
    { index: 4, start: '10:45', end: '11:30' },
  ],
};

const HISTORY: ScheduleSnapshot = snapshotForTerm(ARCHIVE, '2025-2026-2');

describe('term switching', () => {
  it('lists terms and selects an archived term', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <TermSheet
        archive={ARCHIVE}
        selectedTerm="2026-2027-1"
        onSelect={onSelect}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('当前学期')).toBeInTheDocument();
    expect(screen.getByText(/1 门课程/)).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: /2025-2026-2/ }),
    );
    expect(onSelect).toHaveBeenCalledWith('2025-2026-2');
  });

  it('shows a historical term overview and opens a course', async () => {
    const user = userEvent.setup();
    const onOpenCourse = vi.fn();
    const onGoWeek = vi.fn();
    render(
      <TermOverview
        snapshot={HISTORY}
        onOpenCourse={onOpenCourse}
        onGoWeek={onGoWeek}
        onOpenChanges={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: '学期回顾' })).toBeInTheDocument();
    expect(screen.getByText('门课程')).toBeInTheDocument();
    expect(screen.getByText('次课')).toBeInTheDocument();
    expect(screen.getByText('条变动')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /历史测试课/ }));
    expect(onOpenCourse).toHaveBeenCalledWith(
      expect.objectContaining({ course_name: '历史测试课' }),
    );

    await user.click(screen.getByRole('button', { name: '周课表' }));
    expect(onGoWeek).toHaveBeenCalled();
  });
});

// frontend/src/shared/__tests__/week.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { WeekPage } from '../week/WeekPage';

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 3,
  end_period: 4,
  weeks: [9],
  raw_time_text: '',
};

const PERIODS = [
  ['08:00', '08:45'],
  ['08:50', '09:35'],
  ['09:55', '10:40'],
  ['10:45', '11:30'],
  ['11:35', '12:20'],
  ['13:20', '14:05'],
  ['14:10', '14:55'],
  ['15:15', '16:00'],
  ['16:05', '16:50'],
  ['16:55', '17:40'],
  ['18:30', '19:15'],
  ['19:20', '20:05'],
  ['20:10', '20:55'],
].map(([start, end], index) => ({ index: index + 1, start, end }));

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '0.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [COURSE],
  changes: [],
  calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
  period_times: PERIODS,
};

const TODAY = '2026-10-26';

describe('Week page', () => {
  it('renders the grid with a spanning course block', () => {
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="grid"
        onLayoutChange={vi.fn()}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByText('高等数学')).toBeInTheDocument();
    expect(screen.getByText('周三')).toBeInTheDocument();
    expect(screen.getByText('第 9 周')).toBeInTheDocument();
  });

  it('switches to the day list and navigates weeks', async () => {
    const onLayoutChange = vi.fn();
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="grid"
        onLayoutChange={onLayoutChange}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: '单日' }));
    expect(onLayoutChange).toHaveBeenCalledWith('list');

    await userEvent.click(screen.getByRole('button', { name: '下一周' }));
    expect(screen.getByText('第 10 周')).toBeInTheDocument();
    expect(screen.queryByText('高等数学')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '本周' }));
    expect(screen.getByText('第 9 周')).toBeInTheDocument();
  });

  it('renders the selected day list with course details', () => {
    render(
      <WeekPage
        snapshot={SNAPSHOT}
        layout="list"
        onLayoutChange={vi.fn()}
        onOpenCourse={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByText('高等数学')).toBeInTheDocument();
    expect(screen.getByText(/A101/)).toBeInTheDocument();
    expect(screen.getByText(/空档/)).toBeInTheDocument();
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { TodayPage } from '../TodayPage';
import { CourseDetailSheet } from '../today/CourseDetailSheet';

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 1,
  end_period: 2,
  weeks: [9],
  raw_time_text: '周一第1-2节{第9周}',
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
  courses: [
    COURSE,
    {
      ...COURSE,
      course_code: 'PHY101',
      course_name: '大学物理',
      room: 'B202',
      start_period: 3,
      end_period: 4,
    },
  ],
  changes: [
    {
      id: 1,
      detected_at: '2026-10-26T08:00:00+08:00',
      type: 'modified',
      course_code: 'MATH101',
      course_name: '高等数学',
      summary: '高等数学：调整 教室 A101 → B202',
      before: null,
      after: null,
    },
  ],
  calendar: [{ date: '2026-10-26', week: 9, weekday: 1 }],
  period_times: PERIODS,
};

const NOW = new Date('2026-10-26T08:10:00+08:00');

function renderToday(options: { now?: Date; snapshot?: ScheduleSnapshot } = {}) {
  const onOpenCourse = vi.fn();
  const onOpenChange = vi.fn();
  const onOpenChanges = vi.fn();
  const onOpenWeek = vi.fn();
  const onOpenDay = vi.fn();
  const onOpenSemester = vi.fn();
  render(
    <TodayPage
      snapshot={options.snapshot ?? SNAPSHOT}
      now={options.now ?? NOW}
      unreadCount={1}
      onOpenCourse={onOpenCourse}
      onOpenChange={onOpenChange}
      onOpenChanges={onOpenChanges}
      onOpenWeek={onOpenWeek}
      onOpenDay={onOpenDay}
      onOpenSemester={onOpenSemester}
    />,
  );
  return {
    onOpenCourse,
    onOpenChange,
    onOpenChanges,
    onOpenWeek,
    onOpenDay,
    onOpenSemester,
  };
}

describe('Today workbench', () => {
  it('shows the ongoing class and opens it from the timeline', async () => {
    const { onOpenCourse } = renderToday();
    expect(screen.getAllByText(/正在上/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);

    await userEvent.click(
      screen.getAllByRole('button', { name: /高等数学/ })[0],
    );
    expect(onOpenCourse).toHaveBeenCalledWith(COURSE);
  });

  it('opens the latest change and the full change feed', async () => {
    const { onOpenChange, onOpenChanges } = renderToday();
    await userEvent.click(
      screen.getByRole('button', { name: /高等数学：调整/ }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 }),
    );
    await userEvent.click(screen.getByRole('button', { name: /1 项/ }));
    expect(onOpenChanges).toHaveBeenCalled();
  });

  it('opens the week and semester views from the rail', async () => {
    const { onOpenWeek, onOpenDay, onOpenSemester } = renderToday();
    await userEvent.click(
      screen.getByRole('button', { name: /查看本周课表/ }),
    );
    expect(onOpenWeek).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /^一\s*26/ }));
    expect(onOpenDay).toHaveBeenCalledWith(9, 1);

    await userEvent.click(
      screen.getByRole('button', { name: /第 9 \/ 20 周/ }),
    );
    expect(onOpenSemester).toHaveBeenCalled();
  });

  it('renders the finished state after the last class', () => {
    renderToday({ now: new Date('2026-10-26T12:30:00+08:00') });
    expect(screen.getByText('今天已结束')).toBeInTheDocument();
    expect(screen.getByText('今天的课已结束')).toBeInTheDocument();
    expect(screen.getByText('今天的安排已完成')).toBeInTheDocument();
    expect(screen.getByText(/节已上/)).toBeInTheDocument();
    expect(screen.queryByText('今天没有课')).not.toBeInTheDocument();
  });

  it('renders the empty state when no course matches today', () => {
    renderToday({
      snapshot: { ...SNAPSHOT, courses: [] },
      now: new Date('2026-10-26T09:00:00+08:00'),
    });
    expect(screen.getAllByText('今天没有课').length).toBeGreaterThan(0);
  });

  it('shows the next course when today has no classes', () => {
    renderToday({
      now: new Date('2026-10-25T09:00:00+08:00'),
    });
    expect(screen.getByText('接下来')).toBeInTheDocument();
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);
  });



});

describe('course sheet', () => {
  it('shows course details and closes with Escape', async () => {
    const onClose = vi.fn();
    render(<CourseDetailSheet course={COURSE} onClose={onClose} />);
    expect(
      screen.getByRole('heading', { name: '高等数学' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

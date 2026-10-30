import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot, WeekLayout } from '../../types';
import { SchedulePage } from '../schedule/SchedulePage';

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

function renderSchedule(
  weekLayout: WeekLayout = 'grid',
  options: { snapshot?: ScheduleSnapshot; onWeekLayoutChange?: (l: WeekLayout) => void } = {},
) {
  const onWeekLayoutChange = options.onWeekLayoutChange ?? vi.fn();
  const onOpenCourse = vi.fn();
  const onMeta = vi.fn();
  const result = render(
    <SchedulePage
      snapshot={options.snapshot ?? SNAPSHOT}
      today={TODAY}
      weekLayout={weekLayout}
      onWeekLayoutChange={onWeekLayoutChange}
      onOpenCourse={onOpenCourse}
      onMeta={onMeta}
    />,
  );
  return { ...result, onWeekLayoutChange, onOpenCourse, onMeta };
}

describe('Schedule page', () => {
  it('renders week, month, and semester views in one page', async () => {
    renderSchedule();
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);
    expect(screen.getAllByText('第 9 周').length).toBeGreaterThan(0);
    expect(screen.getAllByText('周一').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('tab', { name: '月' }));
    expect(screen.getAllByText('2026 年 10 月').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.month-day')).toHaveLength(42);

    await userEvent.click(screen.getByRole('tab', { name: '学期' }));
    expect(screen.getByText('周次总览 · 课程密度')).toBeInTheDocument();
    expect(screen.getByText('COURSES')).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: '课程时间轴' }),
    );
    expect(screen.getAllByText('课程时间轴').length).toBeGreaterThan(0);
    expect(screen.getByText('课程 / 周次')).toBeInTheDocument();
  });

  it('switches week layout and navigates weeks', async () => {
    const { onWeekLayoutChange } = renderSchedule();
    await userEvent.click(screen.getByRole('button', { name: '单日' }));
    expect(onWeekLayoutChange).toHaveBeenCalledWith('list');

    await userEvent.click(screen.getByRole('button', { name: '下一周' }));
    expect(screen.getAllByText('第 10 周').length).toBeGreaterThan(0);
    expect(screen.queryByText('高等数学')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '回到今天' }));
    expect(screen.getAllByText('第 9 周').length).toBeGreaterThan(0);
  });

  it('renders the selected day list with course details', () => {
    renderSchedule('list');
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/A101/).length).toBeGreaterThan(0);
  });

  it('filters courses by search and clears the query', async () => {
    renderSchedule();
    const search = screen.getByLabelText('搜索课程、教师或教室');
    await userEvent.type(search, '不存在');
    expect(screen.getByText(/没有找到与「不存在」相关的课程/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '清除搜索' }));
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);
  });

  it('opens a course from the timetable', async () => {
    const { onOpenCourse } = renderSchedule();
    await userEvent.click(
      screen.getAllByRole('button', { name: /高等数学/ })[0],
    );
    expect(onOpenCourse).toHaveBeenCalledWith(COURSE);
  });

  it('navigates weeks with the keyboard and a horizontal swipe', async () => {
    const { container } = renderSchedule();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getAllByText('第 10 周').length).toBeGreaterThan(0);
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getAllByText('第 9 周').length).toBeGreaterThan(0);

    const swipe = container.querySelector('.week-stage');
    expect(swipe).not.toBeNull();
    fireEvent.touchStart(swipe!, {
      touches: [{ clientX: 300, clientY: 100 }],
    });
    fireEvent.touchEnd(swipe!, {
      changedTouches: [{ clientX: 120, clientY: 100 }],
    });
    expect(screen.getAllByText('第 10 周').length).toBeGreaterThan(0);
  });

  it('reports its page meta to the shell', () => {
    const { onMeta } = renderSchedule();
    expect(onMeta).toHaveBeenCalledWith(
      expect.objectContaining({ title: '课表' }),
    );
  });
});

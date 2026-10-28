import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CourseSession, ScheduleSnapshot } from '../../types';
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

const SECOND_SESSION: CourseSession = {
  ...COURSE,
  room: 'B202',
  weekday: 3,
  start_period: 5,
  end_period: 6,
};

const PERIODS = Array.from({ length: 6 }, (_, index) => ({
  index: index + 1,
  start: `${String(8 + index).padStart(2, '0')}:00`,
  end: `${String(8 + index).padStart(2, '0')}:45`,
}));

const SNAPSHOT: ScheduleSnapshot = {
  schema_version: 1,
  app_version: '1.1.0',
  synced_at: '2026-10-26T08:00:00+08:00',
  sync_interval_days: 1,
  term: '2026-2027-1',
  first_day: '2026-08-31',
  courses: [COURSE, SECOND_SESSION],
  changes: [],
  calendar: [],
  period_times: PERIODS,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CourseDetailSheet', () => {
  it('lists every weekly session for the course', () => {
    render(
      <CourseDetailSheet
        course={COURSE}
        snapshot={SNAPSHOT}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('2 次课')).toBeInTheDocument();
    expect(screen.getByText(/周三 · 第 5-6 节/)).toBeInTheDocument();
    expect(screen.getByText(/B202/)).toBeInTheDocument();
  });

  it('copies a readable course summary', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <CourseDetailSheet
        course={COURSE}
        snapshot={SNAPSHOT}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: '复制课程信息' }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('教师：李老师'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('周一 第 1-2 节 08:00-09:45'),
    );
    expect(screen.getByText('课程信息已复制')).toBeInTheDocument();
  });

  it('downloads an ICS file when a snapshot is available', async () => {
    const createObjectURL = vi.fn(() => 'blob:test');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    render(
      <CourseDetailSheet
        course={COURSE}
        snapshot={SNAPSHOT}
        onClose={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole('button', { name: '添加到日历（ICS）' }),
    );
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(screen.getByText('已生成 ICS 日历文件')).toBeInTheDocument();
  });

  it('disables ICS export without a snapshot', () => {
    render(<CourseDetailSheet course={COURSE} onClose={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: '添加到日历（ICS）' }),
    ).toBeDisabled();
  });
});

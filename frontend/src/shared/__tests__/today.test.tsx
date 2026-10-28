import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AppStatus } from '../../data/types';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { TodayPage } from '../TodayPage';
import { StaleBadge } from '../StaleBadge';
import { CourseDetailSheet } from '../today/CourseDetailSheet';
import { LayoutSheet } from '../today/LayoutSheet';

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
    { ...COURSE, course_code: 'PHY101', course_name: '大学物理', room: 'B202', start_period: 3, end_period: 4 },
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

function renderToday(
  layout: 'focus' | 'timeline' | 'compact',
  options: { now?: Date; snapshot?: ScheduleSnapshot } = {},
) {
  const onOpenCourse = vi.fn();
  const onOpenLayout = vi.fn();
  const onOpenChanges = vi.fn();
  const onGoWeek = vi.fn();
  render(
    <TodayPage
      snapshot={options.snapshot ?? SNAPSHOT}
      now={options.now ?? NOW}
      layout={layout}
      unreadCount={1}
      onOpenCourse={onOpenCourse}
      onOpenLayout={onOpenLayout}
      onOpenChanges={onOpenChanges}
      onGoWeek={onGoWeek}
    />,
  );
  return { onOpenCourse, onOpenLayout, onOpenChanges, onGoWeek };
}

describe('Today layouts', () => {
  it('renders focus mode with the ongoing class', async () => {
    const { onOpenCourse } = renderToday('focus');
    expect(screen.getAllByText('正在上').length).toBeGreaterThan(0);
    expect(screen.getAllByText('高等数学').length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: /正在上/ }));
    expect(onOpenCourse).toHaveBeenCalledWith(COURSE);
  });

  it('renders timeline mode and opens a course', async () => {
    const { onOpenCourse } = renderToday('timeline');
    expect(screen.getByText('今日概览')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /大学物理/ })[0]);
    expect(onOpenCourse).toHaveBeenCalledWith(
      expect.objectContaining({ course_code: 'PHY101' }),
    );
  });

  it('renders compact mode with summary blocks', () => {
    renderToday('compact');
    expect(screen.getByText('下一节')).toBeInTheDocument();
    expect(screen.getByText('今日节数')).toBeInTheDocument();
    expect(screen.getByText('变动数')).toBeInTheDocument();
  });

  it('connects the change banner and layout button', async () => {
    const { onOpenChanges, onOpenLayout } = renderToday('focus');
    await userEvent.click(screen.getByRole('button', { name: /1 条新变动/ }));
    expect(onOpenChanges).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '布局' }));
    expect(onOpenLayout).toHaveBeenCalled();
  });

  it('renders the finished state after the last class', () => {
    renderToday('focus', { now: new Date('2026-10-26T12:30:00+08:00') });
    expect(screen.getByText('今天的课结束了')).toBeInTheDocument();
  });

  it('renders the empty state when no course matches today', () => {
    renderToday('focus', {
      snapshot: { ...SNAPSHOT, courses: [] },
      now: new Date('2026-10-26T09:00:00+08:00'),
    });
    expect(screen.getByText('今天没课')).toBeInTheDocument();
  });

  it('shows the next course when today has no classes', () => {
    renderToday('focus', {
      now: new Date('2026-10-25T09:00:00+08:00'),
    });
    expect(screen.getByText('下一节')).toBeInTheDocument();
    expect(screen.getByText('高等数学')).toBeInTheDocument();
  });

  it('marks stale snapshots in the header badge', () => {
    render(
      <StaleBadge
        snapshot={{ ...SNAPSHOT, synced_at: '2020-01-01T08:00:00+08:00' }}
      />,
    );
    expect(screen.getByText('数据可能已过期')).toBeInTheDocument();
  });

  it('surfaces a failed sync and cloud status in the header badge', () => {
    const status: AppStatus = {
      configured: true,
      school_configured: true,
      school_username: '20250001',
      push_configured: false,
      cloud_configured: true,
      cloud_pages_url: 'https://alice.github.io/next-class/',
      cloud_gist_id: 'gist-1',
      cloud_last_publish_at: SNAPSHOT.synced_at,
      cloud_last_error: null,
      cloud_qr_ready: true,
      last_sync_at: SNAPSHOT.synced_at,
      last_attempt_at: SNAPSHOT.synced_at,
      next_due_at: null,
      sync_status: 'failed',
      last_error: '登录失败',
      notification_error: null,
      cloud_status: 'failed',
      version: '0.1.0',
    };
    const { rerender } = render(<StaleBadge snapshot={SNAPSHOT} status={status} />);
    expect(screen.getByText(/同步异常/)).toBeInTheDocument();

    rerender(
      <StaleBadge
        snapshot={SNAPSHOT}
        status={{ ...status, sync_status: 'success' }}
      />,
    );
    expect(screen.getByText(/云端未更新/)).toBeInTheDocument();
  });
});

describe('sheets', () => {
  it('selects a Today layout', async () => {
    const onSelect = vi.fn();
    render(<LayoutSheet layout="focus" onSelect={onSelect} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /时间轴/ }));
    expect(onSelect).toHaveBeenCalledWith('timeline');
  });

  it('shows course details and closes with Escape', async () => {
    const onClose = vi.fn();
    render(<CourseDetailSheet course={COURSE} onClose={onClose} />);
    expect(screen.getByRole('heading', { name: '高等数学' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});

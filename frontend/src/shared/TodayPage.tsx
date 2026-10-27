import type { CourseSession, ScheduleSnapshot, TodayLayout } from '../types';
import { buildTodayModel, formatDateLabel } from '../lib/schedule';
import { ChangeBanner } from './today/ChangeBanner';
import { TodayCompact } from './today/TodayCompact';
import { TodayFocus } from './today/TodayFocus';
import { TodayTimeline } from './today/TodayTimeline';

interface TodayPageProps {
  snapshot: ScheduleSnapshot;
  now: Date;
  layout: TodayLayout;
  unreadCount: number;
  onOpenCourse: (course: CourseSession) => void;
  onOpenLayout: () => void;
  onOpenChanges: () => void;
  onGoWeek: () => void;
}

export function TodayPage({
  snapshot,
  now,
  layout,
  unreadCount,
  onOpenCourse,
  onOpenLayout,
  onOpenChanges,
  onGoWeek,
}: TodayPageProps) {
  const model = buildTodayModel(snapshot, now);

  return (
    <section className="today-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">
            {formatDateLabel(model.date)} · 第 {model.week} 周
            {model.estimatedWeek ? '（推算）' : ''}
          </p>
          <h2 className="page-title">今天</h2>
        </div>
        <button type="button" className="ghost-button" onClick={onOpenLayout}>
          布局
        </button>
      </header>

      {unreadCount > 0 && layout !== 'compact' && (
        <ChangeBanner count={unreadCount} onClick={onOpenChanges} />
      )}

      {layout === 'focus' && (
        <TodayFocus
          snapshot={snapshot}
          model={model}
          now={now}
          onOpenCourse={onOpenCourse}
          onGoWeek={onGoWeek}
        />
      )}
      {layout === 'timeline' && (
        <TodayTimeline
          snapshot={snapshot}
          model={model}
          now={now}
          onOpenCourse={onOpenCourse}
        />
      )}
      {layout === 'compact' && (
        <TodayCompact
          snapshot={snapshot}
          model={model}
          unreadCount={unreadCount}
          onOpenCourse={onOpenCourse}
          onOpenChanges={onOpenChanges}
        />
      )}
    </section>
  );
}

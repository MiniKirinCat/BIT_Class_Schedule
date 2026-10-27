// frontend/src/shared/week/WeekPage.tsx
import { useState } from 'react';
import type { CourseSession, ScheduleSnapshot, WeekLayout } from '../../types';
import { currentWeek } from '../../lib/schedule';
import { WeekDayList } from './WeekDayList';
import { WeekGrid } from './WeekGrid';

interface WeekPageProps {
  snapshot: ScheduleSnapshot;
  layout: WeekLayout;
  today: string;
  onLayoutChange: (layout: WeekLayout) => void;
  onOpenCourse: (course: CourseSession) => void;
}

export function WeekPage({
  snapshot,
  layout,
  today,
  onLayoutChange,
  onOpenCourse,
}: WeekPageProps) {
  const thisWeek = currentWeek(snapshot, today);
  const [week, setWeek] = useState(thisWeek);

  return (
    <section className="week-page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{snapshot.term}</p>
          <h2 className="page-title">周课表</h2>
        </div>
        <div className="segmented" role="group" aria-label="周课表布局">
          <button
            type="button"
            className={layout === 'grid' ? 'is-active' : ''}
            aria-pressed={layout === 'grid'}
            onClick={() => onLayoutChange('grid')}
          >
            整周
          </button>
          <button
            type="button"
            className={layout === 'list' ? 'is-active' : ''}
            aria-pressed={layout === 'list'}
            onClick={() => onLayoutChange('list')}
          >
            单日
          </button>
        </div>
      </header>

      <div className="week-toolbar">
        <div className="week-nav">
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeek((value) => value - 1)}
            aria-label="上一周"
          >
            ‹
          </button>
          <span className="week-label">第 {week} 周</span>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeek((value) => value + 1)}
            aria-label="下一周"
          >
            ›
          </button>
        </div>
        <button type="button" className="ghost-button" onClick={() => setWeek(thisWeek)}>
          本周
        </button>
      </div>

      {layout === 'grid' ? (
        <WeekGrid
          snapshot={snapshot}
          week={week}
          today={today}
          onOpenCourse={onOpenCourse}
        />
      ) : (
        <WeekDayList
          snapshot={snapshot}
          week={week}
          today={today}
          onOpenCourse={onOpenCourse}
        />
      )}
    </section>
  );
}

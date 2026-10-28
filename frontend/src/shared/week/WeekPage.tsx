import { useEffect, useRef, useState, type TouchEvent } from 'react';
import type { CourseSession, ScheduleSnapshot, WeekLayout } from '../../types';
import {
  coursesForWeek,
  currentWeek,
  formatWeekRange,
  weekDates,
} from '../../lib/schedule';
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
  const thisWeek = Math.max(1, currentWeek(snapshot, today));
  const [week, setWeek] = useState(thisWeek);
  const [search, setSearch] = useState('');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const dates = weekDates(snapshot.first_day, week);
  const query = search.trim().toLowerCase();
  const hasSearch = query.length > 0;
  const filteredCourses = hasSearch
    ? snapshot.courses.filter((course) =>
        [
          course.course_name,
          course.course_code,
          course.teacher,
          course.room,
          course.campus,
        ].some((value) => value.toLowerCase().includes(query)),
      )
    : snapshot.courses;
  const view: ScheduleSnapshot = hasSearch
    ? { ...snapshot, courses: filteredCourses }
    : snapshot;
  const visibleCount = coursesForWeek(view, week).length;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())
      ) {
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setWeek((value) => Math.max(1, value - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setWeek((value) => value + 1);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function onTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    setWeek((value) => Math.max(1, value + (dx < 0 ? 1 : -1)));
  }

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
            onClick={() => setWeek((value) => Math.max(1, value - 1))}
            aria-label="上一周"
          >
            ‹
          </button>
          <span className="week-label" aria-live="polite">
            第 {week} 周
          </span>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setWeek((value) => value + 1)}
            aria-label="下一周"
          >
            ›
          </button>
        </div>
        <div className="week-tools">
          <span className="week-range">{formatWeekRange(dates)}</span>
          <button
            type="button"
            className="ghost-button"
            disabled={week === thisWeek}
            onClick={() => setWeek(thisWeek)}
          >
            本周
          </button>
        </div>
      </div>

      <div className="week-search" role="search">
        <label className="sr-only" htmlFor="week-search-input">
          搜索课程、教师或教室
        </label>
        <input
          id="week-search-input"
          className="input search-input"
          type="search"
          placeholder="搜索课程、教师或教室"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {search && (
          <button
            type="button"
            className="search-clear"
            aria-label="清除搜索"
            onClick={() => setSearch('')}
          >
            ×
          </button>
        )}
      </div>
      {hasSearch && (
        <p className="search-meta">
          找到 {filteredCourses.length} 门课程
          {filteredCourses.length > 0 && visibleCount === 0
            ? ' · 本周没有安排，试试切换周次'
            : ''}
        </p>
      )}

      <div
        className="week-swipe"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          touchStart.current = null;
        }}
      >
        {hasSearch && filteredCourses.length === 0 ? (
          <div className="empty-state">
            <strong>没有找到课程</strong>
            <span>试试课程名、教师或教室的一部分。</span>
            <button type="button" className="button" onClick={() => setSearch('')}>
              清空搜索
            </button>
          </div>
        ) : layout === 'grid' ? (
          <WeekGrid
            snapshot={view}
            week={week}
            today={today}
            onOpenCourse={onOpenCourse}
          />
        ) : (
          <WeekDayList
            snapshot={view}
            week={week}
            today={today}
            onOpenCourse={onOpenCourse}
          />
        )}
      </div>
      <p className="week-hint">左右滑动或使用 ← → 切换周</p>
    </section>
  );
}

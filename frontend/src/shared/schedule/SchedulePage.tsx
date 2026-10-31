import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import type {
  CourseSession,
  PageMeta,
  ScheduleSnapshot,
  ScheduleView,
  SemesterView as SemesterViewName,
  WeekLayout,
} from '../../types';
import { weekChangeState } from '../../lib/changeView';
import { STORAGE_KEYS, useStoredChoice } from '../../lib/storage';
import {
  coursesForWeek,
  currentWeek,
  formatWeekRange,
  monthSessionCount,
  monthTitle,
  monthWeekRange,
  semesterWeeks,
  shiftMonthKey,
  weekDates,
  weekdayOf,
} from '../../lib/schedule';
import { Icon } from '../Icon';
import { GlobalSearchResults, searchSnapshot } from './GlobalSearchResults';
import { MonthView } from './MonthView';
import { SemesterView } from './SemesterView';
import { WeekBoard } from './WeekBoard';
import { WeekDayList } from './WeekDayList';

export interface ScheduleIntent {
  nonce: number;
  view?: ScheduleView;
  week?: number;
  weekday?: number;
}

interface SchedulePageProps {
  snapshot: ScheduleSnapshot;
  today: string;
  weekLayout: WeekLayout;
  archived?: boolean;
  intent?: ScheduleIntent | null;
  onWeekLayoutChange: (layout: WeekLayout) => void;
  onOpenCourse: (course: CourseSession) => void;
  onMeta: (meta: PageMeta) => void;
}

const VIEWS: Array<[ScheduleView, string]> = [
  ['week', '周'],
  ['month', '月'],
  ['semester', '学期'],
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function monthKicker(monthKey: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  })
    .format(new Date(`${monthKey}-01T12:00:00Z`))
    .toUpperCase();
}

export function SchedulePage({
  snapshot,
  today,
  weekLayout,
  archived = false,
  intent = null,
  onWeekLayoutChange,
  onOpenCourse,
  onMeta,
}: SchedulePageProps) {
  const totalWeeks = semesterWeeks(snapshot);
  const anchorWeek = archived
    ? 1
    : clamp(currentWeek(snapshot, today), 1, totalWeeks);
  const anchorDate = archived ? snapshot.first_day : today;
  const [view, setView] = useStoredChoice<ScheduleView>(
    STORAGE_KEYS.scheduleView,
    'week',
    ['week', 'month', 'semester'] as const,
  );
  const [week, setWeek] = useState(
    clamp(intent?.week ?? anchorWeek, 1, totalWeeks),
  );
  const [weekday, setWeekday] = useState(
    intent?.weekday ?? weekdayOf(anchorDate),
  );
  const [monthKey, setMonthKey] = useState(anchorDate.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState(anchorDate);
  const [semView, setSemView] = useState<SemesterViewName>('overview');
  const [search, setSearch] = useState('');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!intent) return;
    setView(intent.view ?? 'week');
    if (intent.week) setWeek(clamp(intent.week, 1, totalWeeks));
    if (intent.weekday) setWeekday(intent.weekday);
    setSearch('');
  }, [intent, totalWeeks]);

  const hasSearch = search.trim().length > 0;
  const searchResults = hasSearch ? searchSnapshot(snapshot, search) : null;
  const changes = weekChangeState(snapshot, week);

  const meta = useCallback((): PageMeta => {
    if (hasSearch && searchResults) {
      return {
        kicker: `SEARCH · ${searchResults.groups.length} COURSES`,
        title: '课表',
        subtitle: `搜索「${search.trim()}」· ${searchResults.groups.length} 门课程 · ${searchResults.totalSessions} 次安排`,
      };
    }
    if (view === 'week') {
      return {
        kicker: `TIMETABLE · WEEK ${String(week).padStart(2, '0')}`,
        title: '课表',
        subtitle: `${formatWeekRange(weekDates(snapshot.first_day, week))} · ${
          coursesForWeek(snapshot, week).length
        } 节课程`,
      };
    }
    if (view === 'month') {
      return {
        kicker: `TIMETABLE · ${monthKicker(monthKey)}`,
        title: '课表',
        subtitle: `${monthWeekRange(snapshot, monthKey)} · ${monthSessionCount(
          snapshot,
          monthKey,
        )} 节课程`,
      };
    }
    return {
      kicker: 'TIMETABLE · SEMESTER',
      title: '课表',
      subtitle: `${new Set(snapshot.courses.map((course) => course.course_code)).size} 门课程 · ${snapshot.courses.length} 节安排 · ${totalWeeks} 教学周`,
    };
  }, [
    hasSearch,
    monthKey,
    search,
    searchResults,
    snapshot,
    totalWeeks,
    view,
    week,
  ]);

  useEffect(() => {
    onMeta(meta());
  }, [meta, onMeta]);

  useEffect(() => {
    if (view !== 'week') return;
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
        setWeek((value) => Math.min(totalWeeks, value + 1));
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [totalWeeks, view]);

  function changeView(next: ScheduleView) {
    setView(next);
    setSearch('');
    if (next === 'month') {
      setMonthKey(selectedDate.slice(0, 7));
    }
  }

  function jumpToday() {
    setWeek(anchorWeek);
    setWeekday(weekdayOf(anchorDate));
    setMonthKey(anchorDate.slice(0, 7));
    setSelectedDate(anchorDate);
    setSearch('');
  }

  function selectDate(date: string) {
    setSelectedDate(date);
    const nextWeek = clamp(
      Math.floor(
        (new Date(`${date}T12:00:00Z`).getTime() -
          new Date(`${snapshot.first_day}T12:00:00Z`).getTime()) /
          86_400_000 /
          7,
      ) + 1,
      1,
      totalWeeks,
    );
    setWeek(nextWeek);
    setWeekday(weekdayOf(date));
    if (window.matchMedia('(max-width: 920px)').matches) {
      window.requestAnimationFrame(() => {
        document
          .querySelector('.day-agenda')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  function jumpToWeek(targetWeek: number, targetDay: number, _course?: CourseSession) {
    setView('week');
    setWeek(clamp(targetWeek, 1, totalWeeks));
    setWeekday(clamp(targetDay, 1, 7));
    setSearch('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function shiftMonth(delta: number) {
    const next = shiftMonthKey(monthKey, delta);
    setMonthKey(next);
    setSelectedDate(
      !archived && next === today.slice(0, 7) ? today : `${next}-01`,
    );
  }

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
    setWeek((value) =>
      clamp(value + (dx < 0 ? 1 : -1), 1, totalWeeks),
    );
  }

  const head = meta();
  const subtitle = head.subtitle;

  return (
    <section className="page schedule-page">
      <div className="mobile-page-head">
        <div className="eyebrow">{head.kicker}</div>
        <h1>课表</h1>
        <p className="page-sub">{subtitle}</p>
      </div>

      <div className="schedule-toolbar">
        <div className="schedule-heading">
          <span className="eyebrow">{snapshot.term}</span>
        </div>
        <div className="view-tabs" role="tablist" aria-label="课表视图">
          {VIEWS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={view === value ? 'is-active' : ''}
              role="tab"
              aria-selected={view === value}
              onClick={() => changeView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="schedule-search-row">
        <div className="search-box global-search">
          <Icon name="search" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            placeholder="搜索全部课程、教师、教室或校区"
            aria-label="搜索全部课程、教师、教室或校区"
            autoComplete="off"
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              aria-label="清除搜索"
              onClick={() => {
                setSearch('');
                searchRef.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <span className="search-hint">
          {hasSearch
            ? '全局结果 · 点击任一段定位'
            : '跨周搜索 · 支持课程、教师、教室、校区'}
        </span>
      </div>

      {!hasSearch && view === 'week' && (
        <div className="schedule-subhead">
          <div className="week-toolbar">
            <button
              type="button"
              className="arrow-button"
              aria-label="上一周"
              onClick={() => setWeek((value) => Math.max(1, value - 1))}
            >
              <Icon name="arrow-left" />
            </button>
            <div className="week-label">
              <strong>第 {week} 周</strong>
              <span>{formatWeekRange(weekDates(snapshot.first_day, week))}</span>
            </div>
            <button
              type="button"
              className="arrow-button"
              aria-label="下一周"
              onClick={() =>
                setWeek((value) => Math.min(totalWeeks, value + 1))
              }
            >
              <Icon name="arrow-right" />
            </button>
            <button type="button" className="today-jump" onClick={jumpToday}>
              {archived ? '首周' : '回到今天'}
            </button>
            <div className="layout-toggle" role="group" aria-label="课表布局">
              <button
                type="button"
                className={weekLayout === 'grid' ? 'is-active' : ''}
                aria-pressed={weekLayout === 'grid'}
                onClick={() => onWeekLayoutChange('grid')}
              >
                整周
              </button>
              <button
                type="button"
                className={weekLayout === 'list' ? 'is-active' : ''}
                aria-pressed={weekLayout === 'list'}
                onClick={() => onWeekLayoutChange('list')}
              >
                单日
              </button>
            </div>
          </div>
        </div>
      )}

      {!hasSearch && view === 'month' && (
        <div className="schedule-subhead">
          <div className="month-toolbar">
            <button
              type="button"
              className="arrow-button"
              aria-label="上个月"
              onClick={() => shiftMonth(-1)}
            >
              <Icon name="arrow-left" />
            </button>
            <div className="week-label">
              <strong>{monthTitle(monthKey)}</strong>
              <span>{monthWeekRange(snapshot, monthKey)}</span>
            </div>
            <button
              type="button"
              className="arrow-button"
              aria-label="下个月"
              onClick={() => shiftMonth(1)}
            >
              <Icon name="arrow-right" />
            </button>
            <button type="button" className="today-jump" onClick={jumpToday}>
              {archived ? '首周' : '回到今天'}
            </button>
          </div>
        </div>
      )}

      {hasSearch && searchResults ? (
        <div className="schedule-stage">
          <GlobalSearchResults
            snapshot={snapshot}
            query={search}
            results={searchResults}
            anchorWeek={anchorWeek}
            onJump={jumpToWeek}
            onClear={() => {
              setSearch('');
              searchRef.current?.focus();
            }}
          />
        </div>
      ) : view === 'week' ? (
        <div
          className={`schedule-stage week-stage ${
            weekLayout === 'list' ? 'is-list' : 'is-grid'
          }`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onTouchCancel={() => {
            touchStart.current = null;
          }}
        >
          <WeekBoard
            snapshot={snapshot}
            week={week}
            today={today}
            courses={snapshot.courses.filter((course) =>
              course.weeks.includes(week),
            )}
            cancelled={changes.cancelled}
            flags={changes.flags}
            onOpenCourse={onOpenCourse}
          />
          <WeekDayList
            snapshot={snapshot}
            week={week}
            weekday={weekday}
            today={today}
            courses={snapshot.courses.filter((course) =>
              course.weeks.includes(week),
            )}
            cancelled={changes.cancelled}
            flags={changes.flags}
            onSelectDay={setWeekday}
            onOpenCourse={onOpenCourse}
          />
        </div>
      ) : view === 'month' ? (
        <div className="schedule-stage">
          <MonthView
            snapshot={snapshot}
            monthKey={monthKey}
            selectedDate={selectedDate}
            today={today}
            onSelectDate={selectDate}
            onOpenCourse={onOpenCourse}
          />
        </div>
      ) : (
        <div className="schedule-stage">
          <SemesterView
            snapshot={snapshot}
            today={today}
            week={week}
            weekday={weekday}
            semView={semView}
            onSemViewChange={setSemView}
            onJump={jumpToWeek}
            onOpenCourse={onOpenCourse}
          />
        </div>
      )}

    </section>
  );
}

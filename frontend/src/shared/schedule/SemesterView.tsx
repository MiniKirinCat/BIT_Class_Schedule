import { useEffect, useRef } from 'react';
import type {
  CourseSession,
  ScheduleSnapshot,
  SemesterView as SemesterViewName,
} from '../../types';
import { courseGroups } from '../../lib/archive';
import { courseColorStyle } from '../../lib/courseColor';
import {
  coursesForDate,
  currentWeek,
  dateOfWeek,
  formatWeeks,
  periodLabel,
  semesterProgress,
  semesterWeeks,
  teacherShort,
  weekdayName,
} from '../../lib/schedule';

interface SemesterViewProps {
  snapshot: ScheduleSnapshot;
  today: string;
  week: number;
  weekday: number;
  semView: SemesterViewName;
  onSemViewChange: (view: SemesterViewName) => void;
  onJump: (week: number, weekday: number, course?: CourseSession) => void;
  onOpenCourse: (course: CourseSession) => void;
}

export function SemesterView({
  snapshot,
  today,
  week,
  weekday,
  semView,
  onSemViewChange,
  onJump,
  onOpenCourse,
}: SemesterViewProps) {
  const totalWeeks = semesterWeeks(snapshot);
  const current = Math.max(1, Math.min(currentWeek(snapshot, today), totalWeeks));
  const progress = semesterProgress(snapshot, current);
  const groups = courseGroups(snapshot);
  const heatScroll = useRef<HTMLDivElement>(null);
  const timelineScroll = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scroller =
      semView === 'overview' ? heatScroll.current : timelineScroll.current;
    const selected = scroller?.querySelector<HTMLElement>(
      semView === 'overview' ? '.hm-week.is-selected' : '.tl-week.is-selected',
    );
    if (!scroller || !selected) return;
    scroller.scrollLeft = Math.max(0, selected.offsetLeft - scroller.clientWidth / 3);
  }, [semView, week, weekday]);

  return (
    <>
      <div className="semester-stats">
        <div className="stat-card">
          <span>COURSES</span>
          <strong>{groups.length}</strong>
          <small>门课程</small>
        </div>
        <div className="stat-card">
          <span>SESSIONS</span>
          <strong>{snapshot.courses.length}</strong>
          <small>节次安排</small>
        </div>
        <div className="stat-card">
          <span>WEEKS</span>
          <strong>{totalWeeks}</strong>
          <small>教学周</small>
        </div>
        <div className="stat-card">
          <span>PROGRESS</span>
          <strong>{progress}%</strong>
          <small>
            第 {current} / {totalWeeks} 周
          </small>
        </div>
      </div>

      <div className="sub-tabs semester-sub-tabs" role="tablist" aria-label="学期视图">
        <button
          type="button"
          className={semView === 'overview' ? 'is-active' : ''}
          onClick={() => onSemViewChange('overview')}
        >
          周次总览
        </button>
        <button
          type="button"
          className={semView === 'timeline' ? 'is-active' : ''}
          onClick={() => onSemViewChange('timeline')}
        >
          课程时间轴
        </button>
      </div>

      {semView === 'overview' ? (
        <section className="card semester-card">
          <div className="card-head">
            <div>
              <div className="eyebrow">WEEK DENSITY</div>
              <div className="card-title">周次总览 · 课程密度</div>
            </div>
            <span className="card-meta">
              {totalWeeks} 教学周 × 7 天
            </span>
          </div>
          <div className="heatmap-scroll" ref={heatScroll}>
            <div
              className="heatmap"
              style={{
                gridTemplateColumns: `34px repeat(${totalWeeks}, minmax(24px, 1fr))`,
                minWidth: `${34 + totalWeeks * 27}px`,
              }}
            >
              <span className="hm-corner" />
              {Array.from({ length: totalWeeks }, (_, index) => {
                const value = index + 1;
                return (
                  <span
                    className={`hm-week ${value === week ? 'is-selected' : ''}`}
                    key={value}
                  >
                    {value}
                  </span>
                );
              })}
              {Array.from({ length: 7 }, (_, dayIndex) => {
                const day = dayIndex + 1;
                return (
                  <div className="hm-row" key={day}>
                    <span className="hm-day">
                      {weekdayName(day).replace('周', '')}
                    </span>
                    {Array.from({ length: totalWeeks }, (_, weekIndex) => {
                      const value = weekIndex + 1;
                      const date = dateOfWeek(
                        snapshot.first_day,
                        value,
                        day,
                      );
                      const count = coursesForDate(snapshot, date).length;
                      return (
                        <button
                          type="button"
                          className={`hm-cell ${
                            value === week && day === weekday
                              ? 'is-selected'
                              : ''
                          }`}
                          data-count={Math.min(count, 4)}
                          key={value}
                          title={`${date} · ${count} 节课`}
                          onClick={() => onJump(value, day)}
                        >
                          {count || ''}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="heatmap-legend">
            <span>少</span>
            <i className="legend-cell" />
            <i className="legend-cell l1" />
            <i className="legend-cell l2" />
            <i className="legend-cell l3" />
            <span>多</span>
          </div>
          <p className="semester-note">
            颜色越深表示当天课程越多。点选任意格子，可直接跳转到对应周次与星期。
          </p>
        </section>
      ) : (
        <section className="card semester-card">
          <div className="card-head">
            <div>
              <div className="eyebrow">COURSE TIMELINE</div>
              <div className="card-title">课程时间轴</div>
            </div>
            <span className="card-meta">
              {groups.length} 门课程 · 持续周次
            </span>
          </div>
          <div className="timeline-scroll" ref={timelineScroll}>
            <div
              className="timeline-grid"
              style={{ gridTemplateColumns: `minmax(150px, 220px) repeat(${totalWeeks}, minmax(24px, 1fr))` }}
            >
              <span className="tl-corner">课程 / 周次</span>
              {Array.from({ length: totalWeeks }, (_, index) => {
                const value = index + 1;
                return (
                  <span
                    className={`tl-week ${value === week ? 'is-selected' : ''}`}
                    key={value}
                  >
                    {value}
                  </span>
                );
              })}
              {groups.map((group) => {
                const weeks = new Set(
                  group.sessions.flatMap((session) => session.weeks),
                );
                return (
                  <div className="tl-row" key={group.key}>
                    <button
                      type="button"
                      className="tl-course"
                      onClick={() => onOpenCourse(group.course)}
                    >
                      <strong>{group.course.course_name}</strong>
                      <small>
                        {teacherShort(group.course.teacher)} ·{' '}
                        {formatWeeks([...weeks])}
                      </small>
                    </button>
                    {Array.from({ length: totalWeeks }, (_, index) => {
                      const value = index + 1;
                      if (!weeks.has(value)) {
                        return <span className="tl-cell" key={value} />;
                      }
                      const session =
                        group.sessions.find((item) =>
                          item.weeks.includes(value),
                        ) ?? group.course;
                      return (
                        <button
                          type="button"
                          className={`tl-cell is-filled ${
                            !weeks.has(value - 1) ? 'is-start' : ''
                          } ${!weeks.has(value + 1) ? 'is-end' : ''}`}
                          style={courseColorStyle(group.course)}
                          key={value}
                          title={`${group.course.course_name} · 第${value}周 · ${weekdayName(session.weekday)} ${periodLabel(session)}`}
                          onClick={() =>
                            onJump(value, session.weekday, group.course)
                          }
                        >
                          <span className="sr-only">
                            {group.course.course_name} 第{value}周
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="semester-note">
            横向为一个学期 {totalWeeks} 个教学周；点选色块回到对应周次，点课程名查看全部安排。
          </p>
        </section>
      )}
    </>
  );
}

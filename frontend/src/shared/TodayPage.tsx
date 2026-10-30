import type { CSSProperties } from 'react';
import type {
  ChangeRecord,
  CourseSession,
  ScheduleSnapshot,
} from '../types';
import { courseGroups } from '../lib/archive';
import { weekChangeState } from '../lib/changeView';
import { courseColorStyle } from '../lib/courseColor';
import {
  buildTodayModel,
  dateKeyInShanghai,
  dateOfWeek,
  formatClockTime,
  formatDateTime,
  formatDuration,
  periodLabel,
  periodTime,
  previewWeek,
  relativeDayLabel,
  semesterProgress,
  semesterWeeks,
  sessionKey,
  teacherShort,
  upcomingSessions,
  weekdayName,
} from '../lib/schedule';
import { Icon } from './Icon';

interface TodayPageProps {
  snapshot: ScheduleSnapshot;
  now: Date;
  unreadCount: number;
  onOpenCourse: (course: CourseSession) => void;
  onOpenChange: (change: ChangeRecord) => void;
  onOpenChanges: () => void;
  onOpenWeek: () => void;
  onOpenDay: (week: number, weekday: number) => void;
  onOpenSemester: () => void;
}

function clockMinutes(clock: string): number {
  const [hours, minutes] = clock.split(':').map(Number);
  return hours * 60 + minutes;
}

function nowMinutes(now: Date): number {
  return clockMinutes(formatClockTime(now));
}

export function TodayPage({
  snapshot,
  now,
  unreadCount,
  onOpenCourse,
  onOpenChange,
  onOpenChanges,
  onOpenWeek,
  onOpenDay,
  onOpenSemester,
}: TodayPageProps) {
  const model = buildTodayModel(snapshot, now);
  const today = dateKeyInShanghai(now);
  const minutes = nowMinutes(now);
  const focus =
    model.state.kind === 'ongoing' || model.state.kind === 'upcoming'
      ? model.state.course
      : null;
  const finished = model.state.kind === 'finished';
  const weekChanges = weekChangeState(snapshot, model.week);
  const flags = weekChanges.flags;
  const cancelled = weekChanges.cancelled.filter(
    (session) => session.weekday === model.weekday,
  );
  const weekCount = snapshot.courses.filter((course) =>
    course.weeks.includes(model.week),
  ).length;
  const upcoming = upcomingSessions(snapshot, now, 3, today);
  const nextWeek = model.week + 1;
  const totalWeeks = semesterWeeks(snapshot);
  const nextWeekValid = nextWeek <= totalWeeks;
  const nextPreview = nextWeekValid ? previewWeek(snapshot, nextWeek, 2) : [];
  const nextWeekCount = nextWeekValid
    ? snapshot.courses.filter((course) => course.weeks.includes(nextWeek)).length
    : 0;
  const latestChange = snapshot.changes[0] ?? null;
  const groups = courseGroups(snapshot);
  const progressWeek = Math.max(1, Math.min(model.week, totalWeeks));
  const progress = semesterProgress(snapshot, progressWeek);

  const dayStart =
    model.sessions.length > 0
      ? clockMinutes(periodTime(snapshot, model.sessions[0].start_period).start)
      : 480;
  const last = model.sessions[model.sessions.length - 1];
  const dayEnd = last
    ? clockMinutes(periodTime(snapshot, last.end_period).end)
    : 1020;
  const dayProgress =
    dayEnd > dayStart
      ? Math.min(100, Math.max(0, Math.round(((minutes - dayStart) / (dayEnd - dayStart)) * 100)))
      : 0;

  let heroKicker = '今天已结束';
  if (model.state.kind === 'ongoing') {
    const left = Math.max(
      1,
      Math.ceil((model.state.end.getTime() - now.getTime()) / 60_000),
    );
    heroKicker = `正在上 · 还有 ${left} 分钟`;
  } else if (model.state.kind === 'upcoming') {
    heroKicker =
      model.state.minutesUntil <= 1
        ? '下一节 · 即将开始'
        : `下一节 · ${formatDuration(model.state.minutesUntil)}后`;
  } else if (model.state.kind === 'empty') {
    heroKicker = '今天没有课';
  }

  const remaining = model.sessions.filter((session) => {
    const end = periodTime(snapshot, session.end_period).end;
    return clockMinutes(end) > minutes;
  }).length;

  const timelineRows = [
    ...model.sessions.map((session) => ({
      session,
      cancelled: false,
      changed: flags.get(sessionKey(session)),
    })),
    ...cancelled.map((session) => ({
      session,
      cancelled: true,
      changed: undefined,
    })),
  ].sort(
    (a, b) =>
      a.session.start_period - b.session.start_period ||
      a.session.end_period - b.session.end_period,
  );

  const nextLabel =
    model.state.kind === 'ongoing'
      ? '进行中'
      : model.state.kind === 'upcoming'
        ? '下一节'
        : '已结束';

  return (
    <section className="page today-page">
      <div className="mobile-page-head">
        <div className="eyebrow">
          WEEK {String(model.week).padStart(2, '0')} ·{' '}
          {weekdayName(model.weekday)}
        </div>
        <h1>今天</h1>
        <p className="page-sub">
          {new Intl.DateTimeFormat('zh-CN', {
            timeZone: 'Asia/Shanghai',
            month: 'long',
            day: 'numeric',
            weekday: 'short',
          }).format(now)}{' '}
          · 第 {model.week} 周{model.estimatedWeek ? '（推算）' : ''}
        </p>
      </div>

      <div className="today-grid">
        <div className="today-main">
          <article className={`hero ${focus ? 'has-course' : 'is-quiet'}`}>
            <span className="hero-watermark">
              {String(model.week).padStart(2, '0')}
            </span>
            <div className="hero-top">
              <span className="hero-kicker">
                <span className="live-dot" />
                {heroKicker}
              </span>
              <span className="hero-time">{formatClockTime(now)}</span>
            </div>
            <div className="hero-main">
              <h2 className="hero-title">
                {focus
                  ? focus.course_name
                  : finished
                    ? '今天的课已结束'
                    : '今天没有课'}
              </h2>
              <div className="hero-chips">
                {focus ? (
                  <>
                    <span className="hero-chip">
                      <Icon name="clock" />
                      {periodTime(snapshot, focus.start_period).start}–
                      {periodTime(snapshot, focus.end_period).end} ·{' '}
                      {periodLabel(focus)}
                    </span>
                    <span
                      className={`hero-chip ${flags.get(sessionKey(focus)) ? 'is-changed' : ''}`}
                    >
                      <Icon name="pin" />
                      {focus.room || '教室待定'}
                      {flags.get(sessionKey(focus))
                        ? ` · ${flags.get(sessionKey(focus))}`
                        : ''}
                    </span>
                    <span className="hero-chip">
                      <Icon name="teacher" />
                      {teacherShort(focus.teacher)}
                    </span>
                    {focus.campus && (
                      <span className="hero-chip">
                        <Icon name="calendar" />
                        {focus.campus.replace('校区', '')}
                      </span>
                    )}
                  </>
                ) : finished ? (
                  <span className="hero-chip">
                    <Icon name="check" />
                    今天的安排已完成
                  </span>
                ) : (
                  <span className="hero-chip">
                    <Icon name="spark" />
                    留一点空白给今天
                  </span>
                )}
              </div>
            </div>
            <div className="hero-footer">
              <div className="hero-count">
                <strong>
                  {focus
                    ? remaining
                    : finished
                      ? model.sessions.length
                      : 0}
                </strong>
                <span>
                  {finished ? '节已上' : '节待上'} · 今日共{' '}
                  {model.sessions.length} 节
                </span>
              </div>
              <div className="hero-footnote">
                第 {model.week} 周 · {weekdayName(model.weekday)}
                <br />
                {formatDateTime(snapshot.synced_at)} 同步
              </div>
            </div>
            <div className="hero-progress" aria-hidden="true">
              <span style={{ width: `${dayProgress}%` }} />
            </div>
            <button type="button" className="hero-open" onClick={onOpenWeek}>
              查看本周课表 <Icon name="arrow-right" />
            </button>
          </article>

          <section className="card timeline-card">
            <div className="timeline-head">
              <div>
                <div className="eyebrow">
                  TODAY · {model.sessions.length + cancelled.length} SESSIONS
                </div>
                <div className="card-title">今日时间线</div>
              </div>
              <span className="timeline-count">
                {model.sessions.length > 0
                  ? `${periodTime(snapshot, model.sessions[0].start_period).start} – ${periodTime(snapshot, model.sessions[model.sessions.length - 1].end_period).end}`
                  : '空白的一天'}
              </span>
            </div>
            <div className="timeline-list">
              {timelineRows.length === 0 ? (
                <div className="empty-state">
                  <Icon name="spark" />
                  <strong>今天没有课</strong>
                  <span>把时间留给自己，或者看看本周安排。</span>
                  <button type="button" className="button" onClick={onOpenWeek}>
                    查看周课表
                  </button>
                </div>
              ) : (
                timelineRows.map((row, index) => {
                  const { session } = row;
                  const start = periodTime(snapshot, session.start_period).start;
                  const end = periodTime(snapshot, session.end_period).end;
                  const isFocus = focus === session && !row.cancelled;
                  const ended = clockMinutes(end) <= minutes;
                  const label = row.cancelled
                    ? '停课'
                    : isFocus
                      ? nextLabel
                      : ended
                        ? '已结束'
                        : start;
                  const next = timelineRows[index + 1];
                  const gap = next
                    ? clockMinutes(
                        periodTime(snapshot, next.session.start_period).start,
                      ) - clockMinutes(end)
                    : 0;
                  return (
                    <div key={sessionKey(session) + (row.cancelled ? '-c' : '')}>
                      <div
                        className={`timeline-row ${isFocus ? 'is-current' : ''} ${row.cancelled ? 'is-cancelled' : ''}`}
                        style={courseColorStyle(session)}
                      >
                        <div className="timeline-time">
                          <strong>{start}</strong>
                          {end}
                          <br />
                          {periodLabel(session)}
                        </div>
                        <div className="timeline-rail">
                          <span className="timeline-dot" />
                        </div>
                        <button
                          type="button"
                          className="timeline-course"
                          onClick={() => onOpenCourse(session)}
                        >
                          <span className="timeline-course-main">
                            <strong>{session.course_name}</strong>
                            <small>
                              {row.cancelled
                                ? '本周停课 · 下周恢复'
                                : `${session.room || '教室待定'} · ${teacherShort(session.teacher)}${
                                    row.changed ? ` · ${row.changed}` : ''
                                  }`}
                            </small>
                          </span>
                          {isFocus ? (
                            <span className="timeline-current-label">{label}</span>
                          ) : (
                            <span className="card-meta">{label}</span>
                          )}
                        </button>
                      </div>
                      {gap >= 30 && (
                        <div className="timeline-gap">
                          {formatDuration(gap)}空档
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>

        <aside className="right-rail">
          <section className="card rail-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">
                  WEEK {String(model.week).padStart(2, '0')}
                </div>
                <div className="card-title">本周概览</div>
              </div>
              <span className="card-meta">{weekCount} 节</span>
            </div>
            <div className="week-strip">
              {Array.from({ length: 7 }, (_, index) => {
                const date = dateOfWeek(snapshot.first_day, model.week, index + 1);
                const daySessions = snapshot.courses.filter(
                  (course) =>
                    course.weekday === index + 1 &&
                    course.weeks.includes(model.week),
                );
                return (
                  <button
                    key={date}
                    type="button"
                    className={`week-day ${
                      index + 1 === model.weekday ? 'is-today' : ''
                    }`}
                    onClick={() => onOpenDay(model.week, index + 1)}
                  >
                    <span>{weekdayName(index + 1).replace('周', '')}</span>
                    <strong>{Number(date.slice(8, 10))}</strong>
                    <span className="week-dots">
                      {daySessions.slice(0, 3).map((session) => (
                        <i
                          key={sessionKey(session)}
                          style={courseColorStyle(session)}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card rail-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">UP NEXT</div>
                <div className="card-title">接下来</div>
              </div>
              <button type="button" className="card-meta" onClick={onOpenWeek}>
                全周 →
              </button>
            </div>
            <div className="next-list">
              {upcoming.length === 0 ? (
                <p className="rail-empty">接下来几天没有排课。</p>
              ) : (
                upcoming.map((item) => (
                  <button
                    key={sessionKey(item.course) + item.date}
                    type="button"
                    className="next-item"
                    onClick={() => onOpenCourse(item.course)}
                  >
                    <span className="next-when">
                      <strong>{relativeDayLabel(item.date, today)}</strong>
                      {periodTime(snapshot, item.course.start_period).start}
                    </span>
                    <span className="next-copy">
                      <strong>{item.course.course_name}</strong>
                      <small>
                        {item.course.room || '教室待定'} ·{' '}
                        {teacherShort(item.course.teacher)}
                      </small>
                    </span>
                  </button>
                ))
              )}
            </div>
            {nextPreview.length > 0 && (
              <div className="next-week-block">
                <div className="next-week-head">
                  <span className="eyebrow">NEXT WEEK · 第 {nextWeek} 周</span>
                  <button
                    type="button"
                    className="card-meta"
                    onClick={() => onOpenDay(nextWeek, 1)}
                  >
                    {nextWeekCount} 节 →
                  </button>
                </div>
                {nextPreview.map((session) => (
                  <button
                    key={sessionKey(session)}
                    type="button"
                    className="next-week-item"
                    onClick={() => onOpenDay(nextWeek, session.weekday)}
                  >
                    <span className="next-week-day">
                      {weekdayName(session.weekday)}
                    </span>
                    <span className="next-week-time">
                      {periodTime(snapshot, session.start_period).start}
                    </span>
                    <strong>{session.course_name}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="card rail-card">
            <div className="card-head">
              <div>
                <div className="eyebrow">CHANGE FEED</div>
                <div className="card-title">最新变动</div>
              </div>
              <button type="button" className="card-meta" onClick={onOpenChanges}>
                {snapshot.changes.length} 项 →
              </button>
            </div>
            {latestChange ? (
              <button
                type="button"
                className="mini-change"
                onClick={() => onOpenChange(latestChange)}
              >
                <span className="mini-change-top">
                  <span className="mini-change-type">
                    {latestChange.type === 'removed'
                      ? '取消'
                      : latestChange.type === 'modified'
                        ? '调整'
                        : latestChange.type === 'added'
                          ? '新增'
                          : '变动'}
                  </span>
                  {unreadCount > 0 && <span className="demo-tag">未读</span>}
                  <span className="card-meta">
                    {new Intl.DateTimeFormat('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    }).format(new Date(latestChange.detected_at))}
                  </span>
                </span>
                <strong>{latestChange.course_name || '课表变动'}</strong>
                <small>{latestChange.summary}</small>
              </button>
            ) : (
              <p className="rail-empty">还没有检测到变动。</p>
            )}
          </section>

          <button
            type="button"
            className="card rail-card semester-mini-card"
            onClick={onOpenSemester}
          >
            <span className="semester-mini">
              <span
                className="progress-ring"
                style={{ '--pct': String(progress) } as CSSProperties}
              >
                <span>{progress}%</span>
              </span>
              <span className="semester-mini-copy">
                <strong>
                  第 {progressWeek} / {totalWeeks} 周
                </strong>
                <span>学期已过 {progress}%</span>
                <em>
                  {groups.length} 门课 · {snapshot.courses.length} 节安排
                </em>
              </span>
            </span>
          </button>
        </aside>
      </div>
    </section>
  );
}

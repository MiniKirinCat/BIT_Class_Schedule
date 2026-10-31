import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseGroups, type CourseGroup } from '../../lib/archive';
import { courseColorStyle } from '../../lib/courseColor';
import {
  formatWeeks,
  periodTime,
  teacherShort,
  weekdayName,
} from '../../lib/schedule';
import { Icon } from '../Icon';

export interface SearchGroup {
  group: CourseGroup;
  sessions: CourseSession[];
}

export interface SearchResultsModel {
  groups: SearchGroup[];
  totalSessions: number;
}

export function searchSnapshot(
  snapshot: ScheduleSnapshot,
  query: string,
): SearchResultsModel {
  const needle = query.trim().toLowerCase();
  if (!needle) return { groups: [], totalSessions: 0 };

  const groups: SearchGroup[] = [];
  let totalSessions = 0;

  for (const entry of courseGroups(snapshot)) {
    const groupText = [
      entry.course.course_name,
      entry.course.course_code,
      entry.course.teacher,
      entry.course.campus,
    ]
      .join(' ')
      .toLowerCase();
    const groupMatches = groupText.includes(needle);
    const sessions = entry.sessions.filter((session) =>
      groupMatches
        ? true
        : [session.room, session.campus].join(' ').toLowerCase().includes(needle),
    );
    if (sessions.length === 0) continue;
    groups.push({ group: entry, sessions });
    totalSessions += sessions.length;
  }

  groups.sort(
    (a, b) =>
      a.group.course.course_name.localeCompare(b.group.course.course_name, 'zh-CN') ||
      a.group.course.course_code.localeCompare(b.group.course.course_code),
  );
  return { groups, totalSessions };
}

function targetWeek(session: CourseSession, anchorWeek: number): number {
  if (session.weeks.includes(anchorWeek)) return anchorWeek;
  return session.weeks.length ? Math.min(...session.weeks) : 1;
}

interface GlobalSearchResultsProps {
  snapshot: ScheduleSnapshot;
  query: string;
  results: SearchResultsModel;
  anchorWeek: number;
  onJump: (week: number, weekday: number) => void;
  onClear: () => void;
}

export function GlobalSearchResults({
  snapshot,
  query,
  results,
  anchorWeek,
  onJump,
  onClear,
}: GlobalSearchResultsProps) {
  if (results.groups.length === 0) {
    return (
      <div className="search-results">
        <div className="card empty-state search-empty">
          <Icon name="search" />
          <strong>没有找到「{query.trim()}」</strong>
          <span>试试课程名、教师、教室或校区；搜索会覆盖全部教学周。</span>
          <button type="button" className="settings-button" onClick={onClear}>
            清除搜索
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="search-results">
      <div className="search-summary card">
        <div>
          <div className="eyebrow">GLOBAL SEARCH</div>
          <strong>
            {results.groups.length} 门课程 · {results.totalSessions} 次安排
          </strong>
          <span>跨全部教学周；点击任一段定位到对应周与星期。</span>
        </div>
        <button type="button" className="settings-button" onClick={onClear}>
          清除搜索
        </button>
      </div>

      <div className="search-course-list">
        {results.groups.map(({ group, sessions }) => (
          <section
            className="search-course"
            key={group.key}
            style={courseColorStyle(group.course)}
          >
            <header className="search-course-head">
              <span className="course-swatch" aria-hidden="true" />
              <div>
                <strong>{group.course.course_name}</strong>
                <span>
                  {teacherShort(group.course.teacher)} · {group.course.course_code}
                </span>
              </div>
              <em>{sessions.length} 段安排</em>
            </header>
            <div className="search-session-list">
              {sessions.map((session) => {
                const week = targetWeek(session, anchorWeek);
                const start = periodTime(snapshot, session.start_period).start;
                const end = periodTime(snapshot, session.end_period).end;
                return (
                  <button
                    type="button"
                    className="search-session"
                    key={`${session.course_code}-${session.weekday}-${session.start_period}-${session.weeks.join(',')}`}
                    style={courseColorStyle(session)}
                    onClick={() => onJump(week, session.weekday)}
                    aria-label={`${group.course.course_name} 第 ${week} 周 ${weekdayName(session.weekday)} ${start}`}
                  >
                    <span className="search-session-when">
                      <strong>
                        第 {week} 周{week === anchorWeek ? ' · 本周' : ''}
                      </strong>
                      <span>
                        {weekdayName(session.weekday)} · {start}–{end}
                      </span>
                    </span>
                    <span className="search-session-where">
                      {session.room || '教室待定'}
                    </span>
                    <span className="search-session-weeks">
                      {formatWeeks(session.weeks)}
                    </span>
                    <Icon name="arrow-right" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

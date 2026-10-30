import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseColorStyle } from '../../lib/courseColor';
import { buildCourseIcs, courseIcsFilename } from '../../lib/ics';
import {
  compareSessions,
  periodLabel,
  periodTime,
  sessionKey,
  formatWeeks,
  teacherShort,
  weekdayName,
} from '../../lib/schedule';
import { Sheet } from '../Sheet';

interface CourseDetailSheetProps {
  course: CourseSession | null;
  snapshot?: ScheduleSnapshot | null;
  onClose: () => void;
}

function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error('当前浏览器不支持自动复制'));
  }
  return navigator.clipboard.writeText(text);
}

function downloadText(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function CourseDetailSheet({
  course,
  snapshot = null,
  onClose,
}: CourseDetailSheetProps) {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  if (!course) return null;
  const selected = course;

  const sessions = (
    snapshot
      ? snapshot.courses.filter(
          (item) =>
            item.course_code === selected.course_code &&
            item.course_name === selected.course_name,
        )
      : [selected]
  ).sort(compareSessions);
  const weeks = formatWeeks(selected.weeks);

  function summary(): string {
    return [
      selected.course_name,
      `课程代码：${selected.course_code || '未填写'}`,
      `教师：${selected.teacher || '未填写'}`,
      `教室：${selected.room || '未填写'}`,
      selected.campus ? `校区：${selected.campus}` : '',
      `周次：${weeks}`,
      ...sessions.map((session) => {
        const time = snapshot
          ? `${periodTime(snapshot, session.start_period).start}-${periodTime(snapshot, session.end_period).end}`
          : '';
        return [
          `${weekdayName(session.weekday)} ${periodLabel(session)}`,
          time,
        ]
          .filter(Boolean)
          .join(' ');
      }),
    ]
      .filter(Boolean)
      .join('\n');
  }

  async function handleCopy() {
    setError('');
    setNotice('');
    try {
      await copyText(summary());
      setNotice('课程信息已复制');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '复制失败');
    }
  }

  function handleDownload() {
    setError('');
    setNotice('');
    if (!snapshot) {
      setError('当前快照不可用，无法生成日历文件');
      return;
    }
    try {
      downloadText(
        courseIcsFilename(selected),
        buildCourseIcs(snapshot, selected),
      );
      setNotice('已生成 ICS 日历文件');
    } catch {
      setError('生成日历文件失败');
    }
  }

  return (
    <Sheet
      title={selected.course_name}
      kicker={`COURSE · ${selected.course_code || '未填写课程代码'}`}
      onClose={onClose}
    >
      <div
        className="sheet-accent"
        style={courseColorStyle(selected) as CSSProperties}
      />
      <div className="sheet-meta">
        <span className="pill">{teacherShort(selected.teacher)}</span>
        <span className="pill">{selected.room || '教室待定'}</span>
        {selected.campus && <span className="pill">{selected.campus}</span>}
        <span className="pill">{weeks}</span>
      </div>

      <div className="sheet-section">
        <div className="sheet-section-label">
          全部上课安排 · {sessions.length} 段
        </div>
        <div className="session-list">
          {sessions.map((session) => (
            <div className="session-item" key={sessionKey(session)}>
              <span className="session-item-main">
                <strong>
                  {weekdayName(session.weekday)} · {periodLabel(session)}
                </strong>
                <span>
                  {session.room || '教室待定'}
                  {session.campus ? ` · ${session.campus}` : ''}
                </span>
                <small>{formatWeeks(session.weeks)}</small>
              </span>
              {snapshot && (
                <span className="pill">
                  {periodTime(snapshot, session.start_period).start}–
                  {periodTime(snapshot, session.end_period).end}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {selected.raw_time_text && (
        <p className="sheet-note">原始时间：{selected.raw_time_text}</p>
      )}

      <div className="sheet-actions">
        <button type="button" className="button" onClick={() => void handleCopy()}>
          复制课程信息
        </button>
        <button
          type="button"
          className="button button-primary"
          disabled={!snapshot}
          onClick={handleDownload}
        >
          添加到日历（ICS）
        </button>
      </div>
      {notice && (
        <p className="form-hint" aria-live="polite">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" aria-live="polite">
          {error}
        </p>
      )}
    </Sheet>
  );
}

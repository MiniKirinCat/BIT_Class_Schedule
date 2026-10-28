import { useState } from 'react';
import type { CourseSession, ScheduleSnapshot } from '../../types';
import { courseToneStyle } from '../../lib/courseColor';
import { buildCourseIcs, courseIcsFilename } from '../../lib/ics';
import {
  compareSessions,
  periodTime,
  sessionKey,
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
  const weeks =
    selected.weeks.length > 0 ? `第 ${selected.weeks.join('、')} 周` : '未填写';

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
          `${weekdayName(session.weekday)} 第 ${session.start_period}-${session.end_period} 节`,
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
    <Sheet title={selected.course_name} onClose={onClose}>
      <div
        className="sheet-accent course-tone"
        style={courseToneStyle(selected)}
      />
      <div className="sheet-meta">
        <div><strong>教师：</strong>{selected.teacher || '未填写'}</div>
        <div><strong>教室：</strong>{selected.room || '未填写'}</div>
        <div><strong>校区：</strong>{selected.campus || '未填写'}</div>
        <div><strong>周次：</strong>{weeks}</div>
        {selected.raw_time_text && (
          <div><strong>原始时间：</strong>{selected.raw_time_text}</div>
        )}
      </div>

      <div className="sheet-section">
        <div className="section-head">
          <h3 className="section-title">本学期安排</h3>
          <span className="muted">{sessions.length} 次课</span>
        </div>
        <div className="detail-sessions">
          {sessions.map((session) => (
            <div className="detail-session" key={sessionKey(session)}>
              <span className="detail-session-day">
                {weekdayName(session.weekday)} · 第 {session.start_period}-
                {session.end_period} 节
              </span>
              {snapshot && (
                <span className="detail-session-time">
                  {periodTime(snapshot, session.start_period).start}–
                  {periodTime(snapshot, session.end_period).end}
                </span>
              )}
              <span className="detail-session-room">
                {session.room || '教室待定'}
                {session.campus ? ` · ${session.campus}` : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

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
      {notice && <p className="form-hint" aria-live="polite">{notice}</p>}
      {error && <p className="form-error" aria-live="polite">{error}</p>}
    </Sheet>
  );
}

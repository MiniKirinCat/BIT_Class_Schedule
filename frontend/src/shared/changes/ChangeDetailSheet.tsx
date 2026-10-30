import type { ChangeRecord, CourseSession } from '../../types';
import {
  changeDetail,
  changeImpact,
  changeTypeLabel,
  sessionFromChange,
} from '../../lib/changeView';
import { formatDateTime, periodLabel, weekdayName } from '../../lib/schedule';
import { Sheet } from '../Sheet';

interface ChangeDetailSheetProps {
  change: ChangeRecord;
  onClose: () => void;
  onOpenCourse: (course: CourseSession) => void;
}

export function ChangeDetailSheet({
  change,
  onClose,
  onOpenCourse,
}: ChangeDetailSheetProps) {
  const before = sessionFromChange(change.before);
  const after = sessionFromChange(change.after);
  const course = after ?? before;

  return (
    <Sheet
      title={change.course_name || '课表变动'}
      kicker={`CHANGE · ${changeTypeLabel(change.type)}`}
      onClose={onClose}
    >
      <div className={`sheet-change-tag ${change.type === 'removed' ? 'is-removed' : ''}`}>
        {changeTypeLabel(change.type)}
        <span>{formatDateTime(change.detected_at)}</span>
      </div>
      <div className="change-diff">{change.summary}</div>
      <p className="sheet-note">{changeDetail(change)}</p>

      {(before || after) && (
        <div className="sheet-section">
          <div className="sheet-section-label">前后对比</div>
          <div className="change-compare">
            {before && (
              <div className="compare-card">
                <span>调整前</span>
                <strong>{before.course_name}</strong>
                <small>
                  {weekdayName(before.weekday)} {periodLabel(before)} ·{' '}
                  {before.room || '教室待定'}
                </small>
              </div>
            )}
            {after && (
              <div className="compare-card is-after">
                <span>{before ? '调整后' : '新增安排'}</span>
                <strong>{after.course_name}</strong>
                <small>
                  {weekdayName(after.weekday)} {periodLabel(after)} ·{' '}
                  {after.room || '教室待定'}
                </small>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sheet-section">
        <div className="sheet-section-label">影响时间</div>
        <p className="sheet-note">{changeImpact(change)}</p>
      </div>

      <div className="sheet-actions">
        {course && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => onOpenCourse(course)}
          >
            查看课程安排
          </button>
        )}
        <button type="button" className="button" onClick={onClose}>
          知道了
        </button>
      </div>
    </Sheet>
  );
}

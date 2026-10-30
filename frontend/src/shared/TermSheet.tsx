import type { ScheduleArchive } from '../types';
import { termCourseCount, weekSpan } from '../lib/archive';
import { formatDateTime } from '../lib/schedule';
import { Sheet } from './Sheet';

interface TermSheetProps {
  archive: ScheduleArchive;
  selectedTerm: string;
  onSelect: (term: string) => void;
  onClose: () => void;
}

export function TermSheet({
  archive,
  selectedTerm,
  onSelect,
  onClose,
}: TermSheetProps) {
  return (
    <Sheet
      title="切换学期"
      kicker="TERM · LOCAL ARCHIVE"
      onClose={onClose}
    >
      <p className="sheet-note">
        历史学期会在新学期第一次同步后自动保留，可随时切回查看课表、月历与变动。
      </p>
      <div className="session-list term-list">
        {archive.terms.map((term) => {
          const span = weekSpan(term.courses);
          const current = term.term === archive.current_term;
          const viewing = term.term === selectedTerm;
          return (
            <button
              key={term.term}
              type="button"
              className={`session-item term-choice ${viewing ? 'is-selected' : ''}`}
              aria-pressed={viewing}
              onClick={() => onSelect(term.term)}
            >
              <span className="session-item-main">
                <strong>{term.term}</strong>
                <span>
                  {termCourseCount(term)} 门课程
                  {span ? ` · 第 ${span.first}–${span.last} 周` : ''}
                </span>
                <small>同步于 {formatDateTime(term.fetched_at)}</small>
              </span>
              {current ? (
                <span className="term-current">当前学期</span>
              ) : viewing ? (
                <span className="term-viewing">正在查看</span>
              ) : (
                <span className="pill">归档</span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

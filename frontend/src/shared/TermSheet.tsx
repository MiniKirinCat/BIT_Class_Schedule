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
    <Sheet title="切换学期" onClose={onClose}>
      <div className="term-list">
        {archive.terms.map((term) => {
          const span = weekSpan(term.courses);
          const current = term.term === archive.current_term;
          return (
            <button
              key={term.term}
              type="button"
              className={`term-option ${term.term === selectedTerm ? 'is-selected' : ''}`}
              aria-pressed={term.term === selectedTerm}
              onClick={() => onSelect(term.term)}
            >
              <span className="term-option-head">
                <strong>{term.term}</strong>
                {current && <span className="term-current">当前学期</span>}
                {term.term === selectedTerm && !current && (
                  <span className="term-viewing">正在查看</span>
                )}
              </span>
              <span className="term-option-meta">
                {termCourseCount(term)} 门课程
                {span ? ` · 第 ${span.first}–${span.last} 周` : ''} · 同步于{' '}
                {formatDateTime(term.fetched_at)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="form-hint">
        历史学期会在新学期第一次同步后自动保留，可随时切回查看周课表和变动。
      </p>
    </Sheet>
  );
}

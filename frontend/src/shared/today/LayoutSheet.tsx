import type { TodayLayout } from '../../types';
import { Sheet } from '../Sheet';

interface LayoutSheetProps {
  layout: TodayLayout;
  onSelect: (layout: TodayLayout) => void;
  onClose: () => void;
}

const OPTIONS: Array<{
  value: TodayLayout;
  title: string;
  description: string;
  preview: string;
}> = [
  {
    value: 'focus',
    title: '聚焦下一节',
    description: '一眼看清下一节课、教室和倒计时。',
    preview: 'is-focus',
  },
  {
    value: 'timeline',
    title: '时间轴',
    description: '用一条时间线看今天的学习节奏。',
    preview: 'is-timeline',
  },
  {
    value: 'compact',
    title: '信息密度',
    description: '一屏扫完课程、概览和变动。',
    preview: 'is-compact',
  },
];

export function LayoutSheet({ layout, onSelect, onClose }: LayoutSheetProps) {
  return (
    <Sheet title="今天页布局" onClose={onClose}>
      <div className="layout-options">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`layout-option ${layout === option.value ? 'is-active' : ''}`}
            aria-pressed={layout === option.value}
            onClick={() => onSelect(option.value)}
          >
            <span className={`layout-preview ${option.preview}`} aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </span>
            <span className="layout-copy">
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

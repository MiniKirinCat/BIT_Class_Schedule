import type { ThemeName } from '../types';

interface ThemePickerProps {
  theme: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  return (
    <>
      <div className="theme-picker">
        <button
          type="button"
          className={`theme-choice ${theme === 'warm' ? 'is-active' : ''}`}
          data-theme-choice="warm"
          aria-pressed={theme === 'warm'}
          onClick={() => onChange('warm')}
        >
          <span className="theme-swatch" aria-hidden="true">
            <span className="swatch-bg" />
            <span className="swatch-primary" />
            <span className="swatch-hero" />
          </span>
          暖纸
        </button>
        <button
          type="button"
          className={`theme-choice ${theme === 'fog' ? 'is-active' : ''}`}
          data-theme-choice="fog"
          aria-pressed={theme === 'fog'}
          onClick={() => onChange('fog')}
        >
          <span className="theme-swatch" aria-hidden="true">
            <span className="swatch-bg" />
            <span className="swatch-primary" />
            <span className="swatch-hero" />
          </span>
          雾蓝
        </button>
      </div>
      <p className="form-hint">深色模式始终跟随系统，不提供手动深浅开关。</p>
    </>
  );
}

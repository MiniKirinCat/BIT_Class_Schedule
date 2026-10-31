import type { ThemeName } from '../types';
import { THEMES } from '../lib/theme';
import { Icon } from './Icon';

interface ThemePickerProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div className="theme-cards" role="group" aria-label="配色主题">
      {THEMES.map((theme) => {
        const active = theme.name === value;
        return (
          <button
            key={theme.name}
            type="button"
            className={`theme-card ${active ? 'is-active' : ''}`}
            data-preview-theme={theme.name}
            aria-label={`${theme.label} · ${theme.caption} · ${theme.note}`}
            aria-pressed={active}
            onClick={() => onChange(theme.name)}
          >
            <span className="theme-preview" aria-hidden="true">
              <span className="theme-preview-shell">
                <span className="theme-preview-brand">
                  <span className="theme-preview-mark" />
                  <strong>下一节</strong>
                  <em>{theme.label}</em>
                </span>
                <span className="theme-preview-hero">
                  <span>下一节 · 08:00</span>
                  <strong>高等数学</strong>
                  <i />
                </span>
                <span className="theme-preview-row">
                  <span />
                  <span />
                </span>
              </span>
            </span>
            <span className="theme-card-copy">
              <strong>{theme.label}</strong>
              <span>{theme.caption}</span>
              <em>{theme.note}</em>
            </span>
            {active && (
              <span className="theme-card-check" aria-hidden="true">
                <Icon name="check" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import type { CSSProperties } from 'react';
import type { ThemeName } from '../types';
import { THEMES } from '../lib/theme';
import { Icon } from './Icon';

interface ThemePickerProps {
  value: ThemeName;
  onChange: (theme: ThemeName) => void;
}

export function ThemePicker({ value, onChange }: ThemePickerProps) {
  return (
    <div className="theme-options" role="group" aria-label="配色主题">
      {THEMES.map((theme) => {
        const active = theme.name === value;
        return (
          <button
            key={theme.name}
            type="button"
            className={`theme-choice ${active ? 'is-active' : ''}`}
            aria-pressed={active}
            onClick={() => onChange(theme.name)}
            style={
              {
                '--swatch-bg': theme.swatch.background,
                '--swatch-surface': theme.swatch.surface,
                '--swatch-primary': theme.swatch.primary,
                '--swatch-accent': theme.swatch.accent,
              } as CSSProperties
            }
          >
            <span className="theme-swatch" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="theme-choice-copy">
              <strong>{theme.label}</strong>
              <small>{theme.caption}</small>
            </span>
            {active && (
              <span className="theme-choice-check" aria-hidden="true">
                <Icon name="check" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

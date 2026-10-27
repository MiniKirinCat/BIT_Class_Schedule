import { useEffect, useState } from 'react';
import type { ThemeName } from '../types';
import { STORAGE_KEYS, readStorage, writeStorage } from './storage';

export function resolveTheme(value: string | null): ThemeName {
  return value === 'fog' ? 'fog' : 'warm';
}

export function getInitialTheme(): ThemeName {
  return resolveTheme(readStorage(STORAGE_KEYS.theme));
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

export function persistTheme(theme: ThemeName): void {
  writeStorage(STORAGE_KEYS.theme, theme);
  applyTheme(theme);
}

export function useTheme(): [ThemeName, (theme: ThemeName) => void] {
  const [theme, setTheme] = useState<ThemeName>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return [
    theme,
    (next: ThemeName) => {
      setTheme(next);
      persistTheme(next);
    },
  ];
}

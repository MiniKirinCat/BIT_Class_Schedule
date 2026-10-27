// frontend/src/lib/__tests__/theme.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, getInitialTheme, persistTheme, resolveTheme } from '../theme';
import { STORAGE_KEYS } from '../storage';

describe('theme preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to warm and rejects unknown values', () => {
    expect(resolveTheme(null)).toBe('warm');
    expect(resolveTheme('fog')).toBe('fog');
    expect(resolveTheme('purple')).toBe('warm');
    expect(getInitialTheme()).toBe('warm');
  });

  it('applies the data-theme attribute without reloading', () => {
    applyTheme('fog');
    expect(document.documentElement.dataset.theme).toBe('fog');
    applyTheme('warm');
    expect(document.documentElement.dataset.theme).toBe('warm');
  });

  it('persists the selected theme', () => {
    persistTheme('fog');
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe('fog');
    expect(getInitialTheme()).toBe('fog');
  });
});

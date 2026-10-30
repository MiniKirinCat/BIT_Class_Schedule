import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../storage';
import { applyTheme, isThemeName, readStoredTheme, THEMES } from '../theme';

describe('color themes', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.head.innerHTML = '';
  });

  it('lists four distinct themes including paper as the default', () => {
    expect(THEMES.map((theme) => theme.name)).toEqual([
      'paper',
      'celadon',
      'mist',
      'plum',
    ]);
    expect(new Set(THEMES.map((theme) => theme.swatch.background)).size).toBe(4);
    expect(readStoredTheme()).toBe('paper');
  });

  it('restores only valid stored themes', () => {
    localStorage.setItem(STORAGE_KEYS.theme, 'mist');
    expect(readStoredTheme()).toBe('mist');
    expect(isThemeName('plum')).toBe(true);

    localStorage.setItem(STORAGE_KEYS.theme, 'broken');
    expect(readStoredTheme()).toBe('paper');
    expect(isThemeName('broken')).toBe(false);
  });

  it('applies the theme and updates both browser theme colors', () => {
    const light = document.createElement('meta');
    light.name = 'theme-color';
    light.media = '(prefers-color-scheme: light)';
    const dark = document.createElement('meta');
    dark.name = 'theme-color';
    dark.media = '(prefers-color-scheme: dark)';
    document.head.append(light, dark);

    applyTheme('celadon');
    expect(document.documentElement.dataset.theme).toBe('celadon');
    expect(light.content).toBe('#E9F0EA');
    expect(dark.content).toBe('#101817');

    applyTheme('plum');
    expect(document.documentElement.dataset.theme).toBe('plum');
    expect(light.content).toBe('#F0E9E6');
    expect(dark.content).toBe('#181214');
  });
});

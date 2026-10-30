import type { ThemeName } from '../types';
import { readStorage, STORAGE_KEYS } from './storage';

export const THEME_NAMES = ['paper', 'celadon', 'mist', 'plum'] as const;

export interface ThemeOption {
  name: ThemeName;
  label: string;
  caption: string;
  swatch: {
    background: string;
    surface: string;
    primary: string;
    accent: string;
  };
  meta: {
    light: string;
    dark: string;
  };
}

export const THEMES: ThemeOption[] = [
  {
    name: 'paper',
    label: '纸页',
    caption: '暖白 · 深绿',
    swatch: {
      background: '#f2eee3',
      surface: '#fbf8f0',
      primary: '#1e5a47',
      accent: '#b34d32',
    },
    meta: { light: '#F2EEE3', dark: '#141713' },
  },
  {
    name: 'celadon',
    label: '青瓷',
    caption: '青白 · 深青',
    swatch: {
      background: '#e9f0ea',
      surface: '#f8fcf8',
      primary: '#296b63',
      accent: '#b45a3c',
    },
    meta: { light: '#E9F0EA', dark: '#101817' },
  },
  {
    name: 'mist',
    label: '雾蓝',
    caption: '雾灰 · 靛蓝',
    swatch: {
      background: '#e9edf2',
      surface: '#f9fbfe',
      primary: '#345a7a',
      accent: '#b2673d',
    },
    meta: { light: '#E9EDF2', dark: '#101720' },
  },
  {
    name: 'plum',
    label: '绛陶',
    caption: '陶粉 · 绛紫',
    swatch: {
      background: '#f0e9e6',
      surface: '#fdf8f5',
      primary: '#6b3f4e',
      accent: '#a76a2f',
    },
    meta: { light: '#F0E9E6', dark: '#181214' },
  },
];

const THEME_BY_NAME = new Map(THEMES.map((theme) => [theme.name, theme]));

export function isThemeName(value: string | null | undefined): value is ThemeName {
  return Boolean(value && THEME_BY_NAME.has(value as ThemeName));
}

export function readStoredTheme(): ThemeName {
  const value = readStorage(STORAGE_KEYS.theme);
  return isThemeName(value) ? value : 'paper';
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === 'undefined') return;
  const option = THEME_BY_NAME.get(theme);
  if (!option) return;
  document.documentElement.dataset.theme = theme;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.content = meta.media.includes('dark')
        ? option.meta.dark
        : option.meta.light;
    });
}

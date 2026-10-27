import { useState } from 'react';
import type { ThemeName, TodayLayout, WeekLayout } from '../types';

export const STORAGE_KEYS = {
  todayLayout: 'next-class.todayLayout',
  weekLayout: 'next-class.weekLayout',
  theme: 'next-class.theme',
  lastSeenChangeId: 'next-class.lastSeenChangeId',
} as const;

export function readStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // A private-mode browser may reject writes; the in-memory choice still works.
  }
}

export function removeStorage(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore unavailable storage; the in-memory state is still cleared.
  }
}

export function useStoredChoice<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const raw = readStorage(key);
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
  });

  return [
    value,
    (next: T) => {
      setValue(next);
      writeStorage(key, next);
    },
  ];
}

export function defaultWeekLayout(): WeekLayout {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'list';
  }
  return window.matchMedia('(min-width: 900px)').matches ? 'grid' : 'list';
}

export function readLastSeenChangeId(): number {
  const value = Number(readStorage(STORAGE_KEYS.lastSeenChangeId) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function writeLastSeenChangeId(id: number): void {
  writeStorage(STORAGE_KEYS.lastSeenChangeId, String(id));
}

export type { ThemeName, TodayLayout, WeekLayout };

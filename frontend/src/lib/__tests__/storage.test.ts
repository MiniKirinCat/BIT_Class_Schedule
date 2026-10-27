// frontend/src/lib/__tests__/storage.test.ts
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, useStoredChoice } from '../storage';

describe('stored layout choices', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the fallback without treating it as a user choice', () => {
    const { result } = renderHook(() =>
      useStoredChoice('next-class.testLayout', 'focus', ['focus', 'timeline'] as const),
    );
    expect(result.current[0]).toBe('focus');
    expect(localStorage.getItem('next-class.testLayout')).toBeNull();

    act(() => result.current[1]('timeline'));
    expect(result.current[0]).toBe('timeline');
    expect(localStorage.getItem('next-class.testLayout')).toBe('timeline');
  });

  it('restores a stored valid choice and ignores invalid values', () => {
    localStorage.setItem(STORAGE_KEYS.todayLayout, 'compact');
    const first = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.todayLayout, 'focus', ['focus', 'timeline', 'compact'] as const),
    );
    expect(first.result.current[0]).toBe('compact');

    localStorage.setItem(STORAGE_KEYS.todayLayout, 'broken');
    const second = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.todayLayout, 'focus', ['focus', 'timeline', 'compact'] as const),
    );
    expect(second.result.current[0]).toBe('focus');
  });
});

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS, useStoredChoice } from '../storage';

describe('stored layout choices', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('uses the fallback without treating it as a user choice', () => {
    const { result } = renderHook(() =>
      useStoredChoice('next-class.testLayout', 'grid', ['grid', 'list'] as const),
    );
    expect(result.current[0]).toBe('grid');
    expect(localStorage.getItem('next-class.testLayout')).toBeNull();

    act(() => result.current[1]('list'));
    expect(result.current[0]).toBe('list');
    expect(localStorage.getItem('next-class.testLayout')).toBe('list');
  });

  it('restores valid values and ignores invalid ones', () => {
    localStorage.setItem(STORAGE_KEYS.appMode, 'focus');
    const first = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.appMode, 'workbench', [
        'workbench',
        'focus',
      ] as const),
    );
    expect(first.result.current[0]).toBe('focus');

    localStorage.setItem(STORAGE_KEYS.appMode, 'broken');
    const second = renderHook(() =>
      useStoredChoice(STORAGE_KEYS.appMode, 'workbench', [
        'workbench',
        'focus',
      ] as const),
    );
    expect(second.result.current[0]).toBe('workbench');
  });
});

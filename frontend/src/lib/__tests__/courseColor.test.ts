import { describe, expect, it } from 'vitest';
import type { CourseSession } from '../../types';
import { courseHue, courseToneStyle } from '../courseColor';

const COURSE: CourseSession = {
  course_code: 'MATH101',
  course_name: '高等数学',
  teacher: '李老师',
  room: 'A101',
  campus: '良乡',
  weekday: 1,
  start_period: 1,
  end_period: 2,
  weeks: [9],
  raw_time_text: '',
};

describe('course colors', () => {
  it('is deterministic for the same course', () => {
    expect(courseHue(COURSE)).toBe(courseHue(COURSE));
    expect(courseHue(COURSE)).toBeGreaterThanOrEqual(0);
    expect(courseHue(COURSE)).toBeLessThan(360);
  });

  it('returns a css custom property style', () => {
    const style = courseToneStyle(COURSE) as Record<string, string>;
    expect(style['--course-hue']).toBe(String(courseHue(COURSE)));
  });
});

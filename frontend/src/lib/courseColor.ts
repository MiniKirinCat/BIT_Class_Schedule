import type { CSSProperties } from 'react';
import type { CourseSession } from '../types';

const COURSE_HUES = [158, 196, 222, 262, 300, 18, 38, 184];

export function courseHue(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): number {
  const key = `${course.course_code}|${course.course_name}`;
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return COURSE_HUES[hash % COURSE_HUES.length];
}

export function courseToneStyle(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): CSSProperties {
  return { '--course-hue': String(courseHue(course)) } as CSSProperties;
}

export function courseColorStyle(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): CSSProperties {
  return courseToneStyle(course);
}

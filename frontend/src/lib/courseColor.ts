import type { CSSProperties } from 'react';
import type { CourseSession } from '../types';

const COURSE_HUES = [158, 196, 222, 262, 300, 18, 38, 184];

const PAPER_COLORS = [
  '#2f6b55',
  '#b65b3a',
  '#8a6a2f',
  '#4a6488',
  '#8a4b5e',
  '#3f7a73',
  '#a8792b',
  '#5b5f7d',
  '#9c5b4a',
  '#6b7a3a',
  '#4e6e8e',
];

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

export function courseColor(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): string {
  const key = `${course.course_code}|${course.course_name}`;
  let hash = 0;
  for (const char of key) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return PAPER_COLORS[hash % PAPER_COLORS.length];
}

export function courseToneStyle(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): CSSProperties {
  return { '--course-hue': String(courseHue(course)) } as CSSProperties;
}

export function courseColorStyle(
  course: Pick<CourseSession, 'course_code' | 'course_name'>,
): CSSProperties {
  return { '--c': courseColor(course) } as CSSProperties;
}

import type { CourseSession } from '../../types';
import { Sheet } from '../Sheet';

interface CourseDetailSheetProps {
  course: CourseSession | null;
  onClose: () => void;
}

export function CourseDetailSheet({ course, onClose }: CourseDetailSheetProps) {
  if (!course) return null;

  return (
    <Sheet title={course.course_name} onClose={onClose}>
      <div className="sheet-meta">
        <div><strong>教师：</strong>{course.teacher || '未填写'}</div>
        <div><strong>教室：</strong>{course.room || '未填写'}</div>
        <div><strong>校区：</strong>{course.campus || '未填写'}</div>
        <div>
          <strong>周次：</strong>
          {course.weeks.length > 0 ? `第 ${course.weeks.join('、')} 周` : '未填写'}
        </div>
        {course.raw_time_text && (
          <div><strong>原始时间：</strong>{course.raw_time_text}</div>
        )}
      </div>
    </Sheet>
  );
}

import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';

/**
 * 위젯 ID → PIN 보호 feature key 매핑.
 *
 * G002-pin-extract: WidgetCard.tsx에서 추출된 단일 소스.
 * WidgetCard, WidgetModal 모두 이 파일에서 import한다.
 */
export const PIN_FEATURE_MAP: Record<string, ProtectedFeatureKey> = {
  'today-class': 'timetable',
  'weekly-timetable': 'timetable',
  'class-timetable': 'timetable',
  seating: 'seating',
  events: 'schedule',
  'student-records': 'studentRecords',
  meal: 'meal',
  memo: 'memo',
  todo: 'todo',
};

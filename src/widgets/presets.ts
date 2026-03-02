import type { PresetKey } from './types';

/**
 * 학교급/역할별 기본 위젯 프리셋
 * 첫 방문 시 자동 적용
 */
export const WIDGET_PRESETS: Record<PresetKey, readonly string[]> = {
  'elementary-homeroom': ['class-timetable', 'seating', 'meal', 'events', 'memo', 'student-records', 'todo'],
  'elementary-subject': ['class-timetable', 'today-class', 'meal', 'events', 'memo', 'todo'],
  'middle-homeroom': ['weekly-timetable', 'today-class', 'seating', 'meal', 'events', 'memo', 'student-records', 'todo'],
  'middle-subject': ['weekly-timetable', 'today-class', 'meal', 'events', 'memo', 'todo'],
  'high-homeroom': ['weekly-timetable', 'today-class', 'seating', 'meal', 'events', 'memo', 'student-records', 'todo'],
  'high-subject': ['weekly-timetable', 'today-class', 'meal', 'events', 'memo', 'todo'],
  'admin': ['weekly-timetable', 'today-class', 'meal', 'events', 'todo'],
};

/**
 * 학교급 + 담임여부로 프리셋 키를 결정
 */
export function getPresetKey(
  schoolLevel: 'elementary' | 'middle' | 'high',
  hasHomeroom: boolean,
): PresetKey {
  if (!hasHomeroom) {
    if (schoolLevel === 'elementary') return 'elementary-homeroom'; // 초등은 대부분 담임
    return `${schoolLevel}-subject` as PresetKey;
  }
  return `${schoolLevel}-homeroom` as PresetKey;
}

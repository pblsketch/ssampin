import type { PresetKey } from './types';

/**
 * 학교급/역할별 기본 위젯 프리셋
 * 첫 방문 시 자동 적용
 */
export const WIDGET_PRESETS: Record<PresetKey, readonly string[]> = {
  'elementary-homeroom': ['class-timetable', 'seating', 'favorite-tools', 'meal', 'events', 'dday-counter', 'memo', 'student-records', 'survey', 'consultation', 'todo'],
  'elementary-subject': ['class-timetable', 'today-class', 'favorite-tools', 'meal', 'events', 'dday-counter', 'memo', 'todo'],
  'middle-homeroom': ['weekly-timetable', 'today-class', 'seating', 'favorite-tools', 'today-progress', 'meal', 'events', 'dday-counter', 'memo', 'student-records', 'survey', 'consultation', 'todo'],
  'middle-subject': ['weekly-timetable', 'today-class', 'favorite-tools', 'today-progress', 'meal', 'events', 'dday-counter', 'memo', 'todo'],
  'high-homeroom': ['weekly-timetable', 'today-class', 'seating', 'favorite-tools', 'today-progress', 'meal', 'events', 'dday-counter', 'memo', 'student-records', 'survey', 'consultation', 'todo'],
  'high-subject': ['weekly-timetable', 'today-class', 'favorite-tools', 'today-progress', 'meal', 'events', 'dday-counter', 'memo', 'todo'],
  'admin': ['weekly-timetable', 'today-class', 'favorite-tools', 'meal', 'events', 'dday-counter', 'todo'],
  'custom-homeroom': ['weekly-timetable', 'today-class', 'seating', 'favorite-tools', 'meal', 'events', 'dday-counter', 'memo', 'todo'],
  'custom-subject': ['weekly-timetable', 'today-class', 'favorite-tools', 'meal', 'events', 'dday-counter', 'memo', 'todo'],
};

/**
 * 학교급 + 역할 목록으로 프리셋 키를 결정
 * - admin 역할만 선택: 'admin' 프리셋
 * - homeroom 포함: '{schoolLevel}-homeroom'
 * - subject만: '{schoolLevel}-subject'
 * - 하위호환: hasHomeroom boolean도 지원
 */
export function getPresetKey(
  schoolLevel: 'elementary' | 'middle' | 'high' | 'custom',
  hasHomeroom: boolean,
  roles?: readonly ('homeroom' | 'subject' | 'admin')[],
): PresetKey {
  // 역할 배열이 전달된 경우 (온보딩 v2)
  if (roles && roles.length > 0) {
    if (roles.length === 1 && roles[0] === 'admin') {
      return 'admin';
    }
    if (roles.includes('homeroom')) {
      if (schoolLevel === 'custom') return 'custom-homeroom';
      return `${schoolLevel}-homeroom` as PresetKey;
    }
    // subject만
    if (schoolLevel === 'elementary') return 'elementary-homeroom'; // 초등은 대부분 담임
    if (schoolLevel === 'custom') return 'custom-subject';
    return `${schoolLevel}-subject` as PresetKey;
  }

  // 기존 하위호환 로직
  if (!hasHomeroom) {
    if (schoolLevel === 'elementary') return 'elementary-homeroom';
    if (schoolLevel === 'custom') return 'custom-subject';
    return `${schoolLevel}-subject` as PresetKey;
  }
  if (schoolLevel === 'custom') return 'custom-homeroom';
  return `${schoolLevel}-homeroom` as PresetKey;
}

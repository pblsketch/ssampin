import type { Student } from '../entities/Student';
import type { SchoolEvent, CategoryItem } from '../entities/SchoolEvent';

/** 생일 전용 카테고리 */
export const BIRTHDAY_CATEGORY: CategoryItem = {
  id: 'birthday',
  name: '🎂 생일',
  color: 'pink',
};

/** 생일 이벤트 ID 규칙: birthday-{studentId} */
function birthdayEventId(studentId: string): string {
  return `birthday-${studentId}`;
}

/** birthDate(YYYY-MM-DD)에서 올해 날짜로 변환 */
function toThisYearDate(birthDate: string): string {
  const parts = birthDate.split('-');
  if (parts.length < 3) return birthDate;
  const year = new Date().getFullYear();
  return `${year}-${parts[1]}-${parts[2]}`;
}

/**
 * 학생 목록에서 생일 이벤트 생성
 * - 결번(isVacant) 학생 제외
 * - birthDate 없는 학생 제외
 * - recurrence: 'yearly'로 매년 반복
 */
export function generateBirthdayEvents(
  students: readonly Student[],
): SchoolEvent[] {
  return students
    .filter((s) => s.birthDate && !s.isVacant)
    .map((s) => ({
      id: birthdayEventId(s.id),
      title: `🎂 ${s.name} 생일`,
      date: toThisYearDate(s.birthDate!),
      category: 'birthday',
      recurrence: 'yearly' as const,
      source: 'birthday' as const,
      description: `${s.name} 학생의 생일입니다.`,
    }));
}

/**
 * 기존 일정에서 생일 이벤트만 교체 (다른 일정은 보존)
 */
export function mergeBirthdayEvents(
  existingEvents: readonly SchoolEvent[],
  birthdayEvents: readonly SchoolEvent[],
): SchoolEvent[] {
  const nonBirthday = existingEvents.filter((e) => e.source !== 'birthday');
  return [...nonBirthday, ...birthdayEvents];
}

/**
 * 기존 일정에서 생일 이벤트만 제거
 */
export function removeBirthdayEvents(
  existingEvents: readonly SchoolEvent[],
): SchoolEvent[] {
  return existingEvents.filter((e) => e.source !== 'birthday');
}

/**
 * 카테고리 목록에 생일 카테고리가 없으면 추가
 */
export function ensureBirthdayCategory(
  categories: readonly CategoryItem[],
): CategoryItem[] {
  if (categories.some((c) => c.id === 'birthday')) {
    return [...categories];
  }
  return [...categories, BIRTHDAY_CATEGORY];
}

/**
 * 카테고리 목록에서 생일 카테고리 제거
 */
export function removeBirthdayCategory(
  categories: readonly CategoryItem[],
): CategoryItem[] {
  return categories.filter((c) => c.id !== 'birthday');
}

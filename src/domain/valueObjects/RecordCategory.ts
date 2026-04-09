/**
 * RecordCategory — 하위 호환용 타입 alias
 * 기존 closed union을 open string으로 변경하여 사용자 정의 카테고리 지원
 */
export type RecordCategory = string;

/** 담임 기록 카테고리 항목 (2단 구조: 카테고리 + 서브카테고리 목록) */
export interface RecordCategoryItem {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly subcategories: readonly string[];
}

/** 출결 유형 (2단계 선택 1단계) */
export const ATTENDANCE_TYPES = ['결석', '지각', '조퇴', '결과'] as const;

/** 출결 사유 (2단계 선택 2단계) */
export const ATTENDANCE_REASONS = ['질병', '인정', '미인정', '기타'] as const;

/** 기본 카테고리 정의 (사용자 정의 카테고리가 없을 때 fallback) */
export const DEFAULT_RECORD_CATEGORIES: readonly RecordCategoryItem[] = [
  {
    id: 'attendance',
    name: '출결 (ATTENDANCE)',
    color: 'red',
    subcategories: [], // 출결은 ATTENDANCE_TYPES × ATTENDANCE_REASONS 2단계 선택
  },
  {
    id: 'counseling',
    name: '상담 / 관계 (COUNSELING)',
    color: 'blue',
    subcategories: ['학부모상담', '학생상담', '교우관계'],
  },
  {
    id: 'life',
    name: '생활 / 학습 (LIFE & LEARNING)',
    color: 'green',
    subcategories: ['건강', '생활지도', '학습', '칭찬'],
  },
  {
    id: 'etc',
    name: '기타 (OTHER)',
    color: 'gray',
    subcategories: ['진로', '가정연락', '기타'],
  },
];

/** @deprecated 하위 호환용. 신규 코드는 DEFAULT_RECORD_CATEGORIES 사용 */
export const RECORD_CATEGORIES: readonly string[] =
  DEFAULT_RECORD_CATEGORIES.map((c) => c.id);

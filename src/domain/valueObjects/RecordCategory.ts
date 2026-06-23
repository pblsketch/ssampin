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

/**
 * Q2(서브카테고리→태그 흡수): 비출결 분류는 `category + tags` 2축으로 통일된다.
 * subcategory 엔티티 필드는 보존하되 "보이지 않는 MCP 계약 슬롯"으로 격하 — 신규 비출결 저장 시
 * 사용자 입력이 아니라 카테고리별 **중립 sentinel**로 합성한다(tags[0] 종속·P3 역방향 혼입 차단).
 * sentinel 은 각 비출결 카테고리 subcategories[]의 멤버여야 한다(MCP recordNote 멤버십 검증 통과용).
 * 설계: docs/02-design/features/record-system-unification-q2-subcategory-to-tags.design.md §4-가
 */
export const DEFAULT_SUBCATEGORY_SENTINEL = '일반';
export const SUBCATEGORY_SENTINEL_BY_CATEGORY: Readonly<Record<string, string>> = {
  counseling: '일반',
  life: '일반',
  etc: '기타',
};

/**
 * Q2: 비출결 신규 저장 시 subcategory 합성값(카테고리별 중립 sentinel).
 * subcategory 는 사용자 입력 축에서 제거되고 "보이지 않는 MCP 계약 슬롯"이 된다 —
 * tags[0] 종속(P3 역방향 혼입)을 피하려 카테고리별 고정 라벨로 합성한다.
 * ⚠️ 출결(category==='attendance')에는 호출하지 않는다(출결 subcategory 는 "결석 (질병)" 구조적 데이터).
 */
export function synthesizeSubcategory(categoryId: string): string {
  return SUBCATEGORY_SENTINEL_BY_CATEGORY[categoryId] ?? DEFAULT_SUBCATEGORY_SENTINEL;
}

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
    // 선두 '일반' = Q2 sentinel(합성 subcategory 의 멤버십 통과용)
    subcategories: ['일반', '학부모상담', '학생상담', '교우관계'],
  },
  {
    id: 'life',
    name: '생활 / 학습 (LIFE & LEARNING)',
    color: 'green',
    subcategories: ['일반', '건강', '생활지도', '학습', '칭찬'],
  },
  {
    id: 'etc',
    name: '기타 (OTHER)',
    color: 'gray',
    subcategories: ['진로', '가정연락', '기타'], // '기타' = etc sentinel(이미 존재)
  },
];

/** @deprecated 하위 호환용. 신규 코드는 DEFAULT_RECORD_CATEGORIES 사용 */
export const RECORD_CATEGORIES: readonly string[] = DEFAULT_RECORD_CATEGORIES.map((c) => c.id);

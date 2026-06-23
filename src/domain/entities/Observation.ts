export interface ObservationRecord {
  readonly id: string;
  readonly studentId: string;
  readonly classId: string;
  readonly authorId: string;
  readonly date: string; // YYYY-MM-DD (수업일 기준)
  readonly content: string; // 최대 500자
  readonly tags: readonly string[];
  readonly visibility: 'private' | 'shared';
  readonly createdAt: number;
  readonly updatedAt: number;
  /** 통합 입력 폼(S4)에서 부여하는 분류. 기존 레코드는 undefined — additive optional. tags 배열과 별도 보존. */
  readonly category?: string;
}

export interface ObservationData {
  readonly records: readonly ObservationRecord[];
  readonly customTags?: readonly string[];
}

export const DEFAULT_OBSERVATION_TAGS = ['교과역량', '학습태도', '진로흥미', '특이사항'] as const;

/**
 * 교과 관찰 통합 입력(S4)의 분류(category) 후보.
 * 담임 누가기록의 카테고리 축과 개념을 맞춘 통합 모델 — 태그(DEFAULT_OBSERVATION_TAGS)와 직교.
 * 첫 항목('수업 관찰')이 교과 기본값.
 */
export const DEFAULT_OBSERVATION_CATEGORIES = [
  '수업 관찰',
  '상담·관계',
  '생활·학습',
  '기타',
] as const;

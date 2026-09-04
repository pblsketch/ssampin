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
  /**
   * 학기 epoch 스탬프(S2.2·ADR-034) — `date`(수업일)에서 파생한 '2026-1' 형식.
   * buildObservationSaveData가 저장 시 자동 부착한다(withDerivedTerm — createdAt/updatedAt(ms) 금지).
   * 구 데이터에는 없다(부재 = 현행 병합 폴백, 추측 부착 금지). 계약 분류: notMirrored(동기화 메타).
   */
  readonly term?: string;
  /**
   * 관찰 슬롯(`domain/rules/observationSlots.ts` TEACHING_SLOTS) — "어떤 장면인가".
   * 태그(성격 축)와 직교한다. 구 데이터에는 없다 — **부재는 빈 배열이 아니다.**
   * 병합에서 부재를 빈 배열로 덮으면 다른 기기의 슬롯이 지워진다.
   */
  readonly slots?: readonly string[];
  /**
   * 이 낱장이 속한 탐구 흐름(`InquiryThread.id`). 없으면 낱장 그대로다 — **선택이며 필수로 만들지
   * 않는다.** 흐름은 근거 창고에서 묶는 것이 기본 경로이고, 여기엔 보조 경로(입력 시 제안)가 붙는다.
   * 구 데이터에는 없다. 병합은 레코드 단위 LWW 라 이 값도 레코드와 함께 움직인다.
   */
  readonly threadId?: string;
}

/**
 * 삭제 전파용 툼스톤.
 * 기록을 지울 때 "언제 지웠는지"를 남겨, 기기 간 병합에서
 * 상대 기기에 남아 있던 옛 사본이 부활하지 않게 한다.
 */
export interface ObservationTombstone {
  /** ObservationRecord.id */
  readonly id: string;
  /** 삭제 시각(ms) — ObservationRecord.updatedAt 과 동일 축 */
  readonly deletedAt: number;
}

/** 툼스톤 보존 기간 — 지난 툼스톤은 저장 시 정리(GC)된다 */
export const OBSERVATION_TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface ObservationData {
  readonly records: readonly ObservationRecord[];
  readonly customTags?: readonly string[];
  /** 통합 입력 분류(S4) 사용자 추가 목록 — DEFAULT_OBSERVATION_CATEGORIES 외 직접 추가분. */
  readonly customCategories?: readonly string[];
  /** 관찰 슬롯 사용자 추가 목록 — TEACHING_SLOTS 외 직접 추가분. */
  readonly customSlots?: readonly string[];
  /** 삭제 전파용 툼스톤 목록 (과거 데이터에는 없음) */
  readonly deleted?: readonly ObservationTombstone[];
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

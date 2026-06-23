/**
 * UnifiedRecordDraft — 통합 입력 모델 (S4 도메인 토대)
 *
 * 담임(homeroom) / 교과(teaching) 양쪽에서 공용으로 사용하는 UI 입력 모델.
 * 저장 시 맥락에 따라 StudentRecord 또는 ObservationRecord 로 라우팅된다(어댑터 레이어).
 *
 * 설계 참조: docs/02-design/features/record-system-unification-phase1.design.md §4-나, §9.3-1(H1)
 *
 * ⚠️ 불가침:
 *  - MCP 쓰기 화이트리스트(OBSERVATION_FIELDS / RECORD_NOTE_FIELDS)에 새 필드 추가 금지.
 *  - toObservation 결과에서 분류(category)를 tags 배열에 절대 혼입 금지(P3 예방).
 */
import type { StudentRecord } from '../entities/StudentRecord';
import type { ObservationRecord } from '../entities/Observation';
import { synthesizeSubcategory } from './RecordCategory';

// ─── 통합 입력 모델 ──────────────────────────────────────────────────────────

/** 담임 / 교과 통합 입력 드래프트 (UI 모델 — 저장 전 중간 상태). */
export interface UnifiedRecordDraft {
  /** 저장 맥락: 담임 기록 = 'homeroom', 교과 관찰 = 'teaching'. */
  readonly context: 'homeroom' | 'teaching';
  /**
   * 학생 식별자.
   *  - 담임: Student.id
   *  - 교과: tc:{classId}:{studentKey} (브릿지 loopback 와 동일 형태)
   */
  readonly studentRef: string;
  /** 교과 컨텍스트에서 사용하는 수업반 UUID. 담임이면 미사용(undefined). */
  readonly classId?: string;
  /** 기록 날짜 (YYYY-MM-DD). */
  readonly date: string;
  /**
   * 분류(필수 1개).
   *  - 담임: RecordCategoryItem.id ('attendance' | 'counseling' | 'life' | 'etc' | 사용자정의)
   *  - 교과: '수업 관찰'(기본값) 또는 표시 전용 분류 레이블.
   */
  readonly category: string;
  /**
   * 서브카테고리 (담임 2단 구조에서만 사용).
   * 교과 컨텍스트에서는 저장 시 무시된다.
   */
  readonly subcategory?: string;
  /**
   * 태그 목록 (선택, 0개 이상).
   *  - 교과: DEFAULT_OBSERVATION_TAGS + 커스텀 태그.
   *  - 담임: 사용자 정의 태그.
   * ⚠️ category 값을 이 배열에 포함하지 말 것(분류와 태그는 직교, P3 예방).
   */
  readonly tags: readonly string[];
  /** 기록 내용. */
  readonly content: string;
  /** 후속 조치 내용 (category='counseling' 등 해당 시). */
  readonly followUp?: string;
}

// ─── 기본값 ──────────────────────────────────────────────────────────────────

/** 교과 컨텍스트에서 category 가 미지정일 때 사용하는 기본 분류 레이블. */
export const DEFAULT_TEACHING_CATEGORY = '수업 관찰';

// ─── 매핑: UnifiedRecordDraft → 엔티티 ──────────────────────────────────────

/**
 * 통합 드래프트 → StudentRecord 변환 (담임 저장 경로).
 *
 * - category / subcategory / content / date / tags 무손실 전달.
 * - id / studentId / createdAt 은 어댑터(저장 레이어)가 채운다 → 플레이스홀더 빈값.
 */
export function toStudentRecord(
  draft: UnifiedRecordDraft,
): Omit<StudentRecord, 'id' | 'studentId' | 'createdAt'> {
  // Q2: 비출결은 subcategory 가 비면 카테고리별 sentinel 로 합성("보이지 않는 MCP 계약 슬롯").
  //   출결은 호출자가 구조적 subcategory("결석 (질병)")를 명시하므로 그대로 둔다.
  const sub = draft.subcategory?.trim()
    ? draft.subcategory
    : draft.category === 'attendance'
      ? (draft.subcategory ?? '')
      : synthesizeSubcategory(draft.category);
  return {
    category: draft.category,
    subcategory: sub,
    content: draft.content,
    date: draft.date,
    tags: draft.tags.length > 0 ? [...draft.tags] : undefined,
    followUp: draft.followUp,
  };
}

/**
 * 통합 드래프트 → ObservationRecord 부분 변환 (교과 저장 경로).
 *
 * - content / date / tags / classId / category(별도 필드) 전달.
 * ⚠️ category 값을 tags 배열에 절대 혼입하지 않는다(P3, CT-1).
 * - id / studentId / authorId / visibility / createdAt / updatedAt 은 어댑터가 채운다.
 */
export function toObservation(
  draft: UnifiedRecordDraft,
): Omit<
  ObservationRecord,
  'id' | 'studentId' | 'authorId' | 'visibility' | 'createdAt' | 'updatedAt'
> {
  return {
    classId: draft.classId ?? '',
    content: draft.content,
    date: draft.date,
    // ⚠️ tags 에 category 절대 혼입 금지: tags 와 category 는 별도 필드(P3).
    tags: [...draft.tags],
    category: draft.category,
  };
}

// ─── 흡수 매핑: 엔티티 → UnifiedRecordDraft (읽기/표시 전용) ─────────────────

/**
 * ObservationRecord → UnifiedRecordDraft 흡수 (교과 읽기/표시).
 *
 * - category 필드가 없는 기존 레코드는 DEFAULT_TEACHING_CATEGORY 로 안전 기본값.
 * - tags 는 record.tags 그대로(분류 미포함).
 * - context / studentRef / classId 는 호출자가 채워야 한다(표시 레이어 책임).
 */
export function fromObservation(rec: ObservationRecord, studentRef: string): UnifiedRecordDraft {
  return {
    context: 'teaching',
    studentRef,
    classId: rec.classId,
    date: rec.date,
    category: rec.category ?? DEFAULT_TEACHING_CATEGORY,
    subcategory: undefined,
    tags: [...rec.tags],
    content: rec.content,
    followUp: undefined,
  };
}

/**
 * StudentRecord → UnifiedRecordDraft 흡수 (담임 읽기/표시).
 *
 * - category / subcategory / content / date 무손실.
 * - tags 는 record.tags ?? [] 로 안전 기본값.
 * - context / studentRef 는 호출자가 채워야 한다(표시 레이어 책임).
 */
export function fromStudentRecord(rec: StudentRecord, studentRef: string): UnifiedRecordDraft {
  return {
    context: 'homeroom',
    studentRef,
    classId: undefined,
    date: rec.date,
    category: rec.category,
    subcategory: rec.subcategory,
    tags: rec.tags ? [...rec.tags] : [],
    content: rec.content,
    followUp: rec.followUp,
  };
}

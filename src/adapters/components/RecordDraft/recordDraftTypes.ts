import type { DraftPackEvidence } from '@domain/services/recordDraftPack';

/** 생기부 초안 화면이 다루는 학생 한 줄 — 담임(Student.id)과 수업반('tc:{classId}:{studentKey}')을 같은 모양으로. */
export interface RecordDraftStudentRow {
  /** 학생 신원 키(담임=Student.id / 수업반='tc:{classId}:{studentKey}'). */
  readonly studentRef: string;
  readonly number: number;
  readonly name: string;
  /** 담임 학생 id. */
  readonly studentId?: string;
  /** 수업반 학생 번호 키. */
  readonly studentKey?: string;
}

/** 초안 화면의 보기 — 학생별 집중 보기(기본) / 전체 훑어보기(30명 목록). ADR-093. */
export type RecordDraftLayout = 'focus' | 'overview';

/** 한 학생분의 초안 재료. 화면(부모)이 실명 그대로 준다 — 가리는 일은 꾸러미가 한다. */
export interface DraftTarget {
  /** 저장할 때 쓰는 학생 키. */
  readonly studentRef: string;
  /** 학생 이름(화면용). 모델에게는 **꾸러미가 별칭으로 바꿔서** 보낸다. */
  readonly displayName: string;
  /** 이 영역의 근거(주제 무관). 주제를 고르면 `studentEvidences` 에서 그 주제 것만 골라 보낸다. */
  readonly evidences: readonly DraftPackEvidence[];
  readonly standardKeywords?: readonly string[];
  /** 이미 초안이 있으면 "바꾸기 / 뒤에 붙이기"를 물어본다. */
  readonly existingText?: string;
}

/**
 * 부모 등록부(`liveDraftTextRef`)의 항목 — 행이 지금 화면에 든 글과 그 글을 마지막으로 고친 시각.
 * 시각이 있어야 **저장된 글보다 새로운지** 가릴 수 있다(옛 글로 반영본을 덮는 사고 방지).
 */
export interface LiveDraftEntry {
  readonly text: string;
  readonly at: number;
}

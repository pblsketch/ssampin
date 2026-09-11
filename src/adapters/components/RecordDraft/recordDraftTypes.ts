import type {
  DraftPackChainItem,
  DraftPackEvidence,
  DraftPackScene,
} from '@domain/services/recordDraftPack';
import type { ResolvedComposition } from '@domain/rules/recordStyleCompose';
import type { NarrativeFrameId } from '@domain/rules/narrativeFrames';
import type { NarrativeScene } from '@domain/entities/InquiryThread';

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

/**
 * 근거 정리에서 초안 화면으로 넘기는 "이걸로 초안 써 줘" 쪽지.
 *  - `thread`    [이 주제로 초안 쓰기]·[이어진 흐름 전체로](ADR-103) — 주제 하나(또는 앞뒤 사슬)의 근거·장면으로.
 *  - `selection` 근거 지도의 [고른 근거 N건으로 초안 쓰기](ADR-106) — 고른 근거만, 차례는 연결을 따라.
 * ★두 쪽지는 서로를 지운다(주제를 고르면 선택이 풀리고, 선택을 보내면 주제가 풀린다).
 */
export type WriteDraftRequest =
  | { readonly kind: 'thread'; readonly threadId: string; readonly chain: boolean }
  | { readonly kind: 'selection'; readonly evidenceIds: readonly string[] }
  /** 고른 것 없이 [근거 N건으로 초안 쓰기] — 지금 범위(영역) 전체. AI 패널의 「전체 근거」 경로 그대로다. */
  | { readonly kind: 'all' };

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
  /**
   * 이 학생의 서사 장면 스냅샷(ADR-103) — **실행을 시작할 때 고정한다.**
   *
   * ★`ref` 에 두면 안 된다. 큐는 [이어 하기]·자동 이어가기로 다시 들어오고, 그때 `ref` 는
   *   지금 값을 읽어 버린다. 장면은 [반영] 사이에 선생님이 바로 고치는 자료라, 큐가 도는
   *   중간에 값이 바뀌면 학생마다 다른 서사로 나간다. 큐 항목(`phase.queue`)에 실어 두면
   *   재진입해도 시작 시점의 값이 그대로 따라온다.
   * ★없으면 장면 없는 경로다(요청서가 기준선과 같다).
   */
  readonly narrative?: DraftTargetNarrative;
}

/** 실행 시작 시점에 고정한 서사 — 구성·장면·이어진 흐름. */
export interface DraftTargetNarrative {
  readonly threadId: string;
  readonly frame: NarrativeFrameId;
  /** 판본 문지기를 아직 안 거친 원본 구성. 실행 직전에 문지기를 통과시킨다. */
  readonly composition: ResolvedComposition;
  readonly scenes: readonly DraftPackScene[];
  /** 발자국에 남길 자리 순서(카탈로그 id 기반). 자유 글은 담지 않는다. */
  readonly stampScenes: readonly NarrativeScene[];
  readonly chain?: readonly DraftPackChainItem[];
}

/**
 * 부모 등록부(`liveDraftTextRef`)의 항목 — 행이 지금 화면에 든 글과 그 글을 마지막으로 고친 시각.
 * 시각이 있어야 **저장된 글보다 새로운지** 가릴 수 있다(옛 글로 반영본을 덮는 사고 방지).
 */
export interface LiveDraftEntry {
  readonly text: string;
  readonly at: number;
}

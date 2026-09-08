/**
 * 생기부 AI **실행 상태** 스토어(ADR-093 결정 3, 저장 안 함).
 *
 * 초안 생성 큐와 분량 조절 단계를 화면(패널 인스턴스)이 아니라 여기가 든다.
 *
 * ★왜: 오른쪽 패널은 학생·영역이 바뀌면 통째로 새로 만들어진다(`key`). 큐·결과가 패널 상태에 있으면
 *   - "남은 학생 모두"가 다음 학생으로 넘어가며 선택을 바꾸는 순간 큐가 사라져 **2명째에서 끊긴다**(P6),
 *   - 분량 조절 결과가 학생을 잠깐 바꾸는 것만으로 사라지고, 실행 중 바꾸면 결과가 **소리 없이 버려진다**(P7).
 * ★결과는 **요청한 학생의 칸**으로만 간다. 초안 큐 항목은 자기 `studentRef` 를 들고 있고, 분량 조절은
 *   행의 3축 키(`studentRef:area:subject`)로 저장돼 다른 학생 화면에는 보이지 않는다.
 * ★초안 큐는 **scope(영역·과목·수업반)별**로 따로 든다 — 자율활동 큐가 도는 동안 진로활동에서 시작한 실행이
 *   끝나며 자율활동 큐를 지우는 일이 없게(리뷰 지적 2).
 * ★디스크에 쓰지 않는다. 앱을 끄면 진행 중 실행은 끝난 것이다(판은 `useRecordAiDraftStore` 에 이미 남아 있다).
 */
import { create } from 'zustand';
import type { NarrativeParagraph } from '@domain/rules/narrativeParagraphs';
import type { DraftTarget } from '@adapters/components/RecordDraft/recordDraftTypes';

export type DraftRunPhase =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'running';
      readonly done: number;
      readonly total: number;
      readonly name: string;
      /** 지금 쓰는 중인 학생. `queue` 도 이 학생부터 시작한다(`queue.slice(i)`). */
      readonly studentRef: string;
      readonly queue: readonly DraftTarget[];
    }
  | {
      readonly kind: 'preview';
      readonly studentRef: string;
      readonly name: string;
      /** 이어서 처리할 학생들. */
      readonly queue: readonly DraftTarget[];
    }
  | {
      readonly kind: 'stopped';
      readonly message: string;
      /** 한도·오류로 멈춘 자리. [이어 하기] 가 여기서 다시 시작한다. */
      readonly queue: readonly DraftTarget[];
    };

/** 분량 조절 후보 — `lengthAdjustRun.LengthAdjustCandidate` 와 같은 모양(순환 import 회피). */
export interface RunLengthCandidate {
  readonly attempt: 1 | 2;
  readonly paragraphs: readonly NarrativeParagraph[];
  readonly bytes: number;
  readonly insufficient: boolean;
  readonly includedCount: number;
  readonly excluded: string;
  readonly nonDraft: boolean;
  readonly nonDraftReason: string;
}

export interface RunLengthOutcome {
  readonly candidates: readonly RunLengthCandidate[];
  readonly sourceText: string;
  readonly sourceProhibited: readonly string[];
}

export type LengthRunStage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'confirm-prohibited'; readonly categories: readonly string[] }
  | { readonly kind: 'running'; readonly attempt: 1 | 2 }
  | { readonly kind: 'result'; readonly outcome: RunLengthOutcome }
  | { readonly kind: 'failed'; readonly message: string; readonly detail?: string };

const IDLE_DRAFT: DraftRunPhase = { kind: 'idle' };
const IDLE_LENGTH: LengthRunStage = { kind: 'idle' };

interface RecordAiRunState {
  /**
   * 초안 생성 큐 — scope 별. `scope` = `${classId ?? 'homeroom'}:${area}:${subject ?? ''}`.
   * idle 인 scope 는 항목이 없다.
   */
  readonly drafts: Readonly<Record<string, DraftRunPhase>>;
  /** 진행 중 초안 생성의 [중단] 손잡이 — scope 별. 새 패널 인스턴스도 이걸로 멈출 수 있다. */
  readonly draftAbort: Readonly<Record<string, AbortController>>;
  /** 분량 조절 단계 — 행의 3축 키별. */
  readonly length: Readonly<Record<string, LengthRunStage>>;

  setDraftPhase: (scope: string, phase: DraftRunPhase) => void;
  setDraftAbort: (scope: string, abort: AbortController | null) => void;
  /** 이 scope 의 큐를 읽는다(구독 없이). 없으면 idle. */
  draftPhaseFor: (scope: string) => DraftRunPhase;
  setLengthStage: (runKey: string, stage: LengthRunStage) => void;
  lengthStageFor: (runKey: string) => LengthRunStage;
  /** 테스트·화면 초기화용. */
  reset: () => void;
}

/** 초안 큐의 scope 키. 화면과 패널이 같은 함수를 써야 한다. */
export function draftRunScope(input: {
  readonly area: string;
  readonly subject?: string;
  readonly classId?: string;
}): string {
  return `${input.classId ?? 'homeroom'}:${input.area}:${input.subject ?? ''}`;
}

/** 지금 실행에 걸린 학생들(미작성 필터가 행을 붙들어 두는 데 쓴다). idle 이면 빈 배열. */
export function activeStudentRefsOf(phase: DraftRunPhase): readonly string[] {
  // running 의 queue 는 지금 쓰는 학생부터 시작한다(queue.slice(i)) — studentRef 를 따로 더하지 않는다.
  if (phase.kind === 'running') return phase.queue.map((q) => q.studentRef);
  if (phase.kind === 'preview') return [phase.studentRef, ...phase.queue.map((q) => q.studentRef)];
  if (phase.kind === 'stopped') return phase.queue.map((q) => q.studentRef);
  return [];
}

function without<T>(rec: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...rec };
  delete next[key];
  return next;
}

export const useRecordAiRunStore = create<RecordAiRunState>()((set, get) => ({
  drafts: {},
  draftAbort: {},
  length: {},

  setDraftPhase: (scope, phase) =>
    set((s) => ({
      drafts: phase.kind === 'idle' ? without(s.drafts, scope) : { ...s.drafts, [scope]: phase },
    })),
  setDraftAbort: (scope, abort) =>
    set((s) => ({
      draftAbort:
        abort === null ? without(s.draftAbort, scope) : { ...s.draftAbort, [scope]: abort },
    })),
  draftPhaseFor: (scope) => get().drafts[scope] ?? IDLE_DRAFT,

  setLengthStage: (runKey, stage) =>
    set((s) => ({
      length: stage.kind === 'idle' ? without(s.length, runKey) : { ...s.length, [runKey]: stage },
    })),
  lengthStageFor: (runKey) => get().length[runKey] ?? IDLE_LENGTH,

  reset: () => set({ drafts: {}, draftAbort: {}, length: {} }),
}));

import { create } from 'zustand';

export type QuickAddKind = 'todo' | 'event' | 'memo' | 'note' | 'bookmark' | 'student-record';

/**
 * 빠른 학생 기록을 **어느 목록에서 열었는지**. 저장에 성공하면 이 목록으로 돌아간다
 * (대시보드 3교시 2-5 칩에서 시작했으면 다시 2-5 명단으로).
 * 저장 위치를 정하는 값이 아니다 — 맥락은 화면에서 선생님이 직접 고른다.
 */
export interface QuickAddStudentRecordFocus {
  readonly classId?: string;
  /**
   * 대시보드에서 학생 칩을 바로 눌렀을 때의 학생(`QuickRecordCandidate.identity`).
   * 학생만 미리 골라 둘 뿐, 저장 위치는 여전히 다음 화면에서 직접 고른다.
   */
  readonly studentIdentity?: string;
  /**
   * 반 카드의 학생 칸을 눌렀을 때(ADR-135) — 학생과 **저장 위치가 이미 정해진 채** 글쓰기로 연다.
   * ADR-122 결정 2("들어온 화면으로 저장 위치를 정하지 않는다")의 유일한 예외다 — 특정 반 카드의
   * 칸을 누른 것 자체가 저장 위치를 고른 행동이기 때문이다. 저장에 성공하면 창을 닫는다.
   */
  readonly direct?: QuickRecordDirectTarget;
}

/** 칸에서 바로 쓰기의 대상 — `QuickRecordContext` 의 (kind, contextId, studentRef)와 같은 뜻. */
export interface QuickRecordDirectTarget {
  readonly contextKind: 'homeroom' | 'teaching';
  /** 담임은 `'homeroom'`, 교과는 `TeachingClass.id` */
  readonly contextId: string;
  /** 담임은 `Student.id`, 교과는 `studentKey` */
  readonly studentRef: string;
}

interface QuickAddState {
  isOpen: boolean;
  /** 현재 모달의 kind. closed 상태에서는 null 유지하지 않고 마지막 값 보존(exit 애니메이션용) */
  kind: QuickAddKind | null;
  /** 연속 트리거 시 kind 교체를 위한 flash 트리거 */
  swapToken: number;
  /** 'student-record' 로 열 때만 의미 있다. 다른 kind 로 열면 비운다. */
  studentRecordFocus: QuickAddStudentRecordFocus | null;
  open: (kind: QuickAddKind, focus?: QuickAddStudentRecordFocus | null) => void;
  close: () => void;
}

export const useQuickAddStore = create<QuickAddState>((set, get) => ({
  isOpen: false,
  kind: null,
  swapToken: 0,
  studentRecordFocus: null,

  open: (kind, focus = null) => {
    const state = get();
    const nextFocus = kind === 'student-record' ? focus : null;
    // 이미 열려있는데 다른 kind로 트리거 → swap (flicker 방지)
    if (state.isOpen && state.kind !== kind) {
      set({ kind, swapToken: state.swapToken + 1, studentRecordFocus: nextFocus });
      return;
    }
    set({ isOpen: true, kind, studentRecordFocus: nextFocus });
  },

  close: () => {
    set({ isOpen: false });
  },
}));

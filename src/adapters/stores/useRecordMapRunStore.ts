import { create } from 'zustand';
import type { RecordArea } from '@domain/entities/RecordDraft';
import type {
  RecordMapReviewPace,
  RecordMapScaffoldPolicy,
  RecordMapTargetMode,
} from '@domain/entities/RecordMapProposal';

type ScaffoldMode = RecordMapScaffoldPolicy['kind'];

interface RecordMapRunUiState {
  readonly open: boolean;
  readonly contextKey: string | null;
  readonly targetMode: RecordMapTargetMode;
  readonly selectedStudentRefs: readonly string[];
  readonly reviewPaceKind: RecordMapReviewPace['kind'];
  readonly batchSize: string;
  readonly scaffoldMode: ScaffoldMode;
  readonly scaffoldId: string | null;
  readonly area: RecordArea | null;
  readonly activeRunId: string | null;
  readonly focusedStudentRef: string | null;
  openFor: (
    contextKey: string,
    currentStudentRef: string | null,
    initialArea: RecordArea | null,
  ) => void;
  close: () => void;
  setTargetMode: (mode: RecordMapTargetMode) => void;
  setSelectedStudentRefs: (refs: readonly string[]) => void;
  setReviewPaceKind: (kind: RecordMapReviewPace['kind']) => void;
  setBatchSize: (value: string) => void;
  setScaffoldMode: (mode: ScaffoldMode) => void;
  setScaffoldId: (id: string | null) => void;
  setArea: (area: RecordArea) => void;
  setActiveRunId: (runId: string | null) => void;
  setFocusedStudentRef: (studentRef: string | null) => void;
}

const defaults = {
  targetMode: 'current' as const,
  selectedStudentRefs: [] as readonly string[],
  reviewPaceKind: 'one' as const,
  batchSize: '3',
  scaffoldMode: 'existing' as const,
  scaffoldId: null,
  activeRunId: null,
  focusedStudentRef: null,
};

/** 패널을 닫아도 같은 학급·영역의 선택과 진행 중인 실행을 보존한다. */
export const useRecordMapRunStore = create<RecordMapRunUiState>((set, get) => ({
  open: false,
  contextKey: null,
  area: null,
  ...defaults,
  openFor: (contextKey, currentStudentRef, initialArea) => {
    if (get().contextKey === contextKey) {
      set({ open: true });
      return;
    }
    set({
      open: true,
      contextKey,
      area: initialArea,
      ...defaults,
      selectedStudentRefs: currentStudentRef === null ? [] : [currentStudentRef],
      focusedStudentRef: currentStudentRef,
    });
  },
  close: () => set({ open: false }),
  setTargetMode: (targetMode) => set({ targetMode }),
  setSelectedStudentRefs: (selectedStudentRefs) => set({ selectedStudentRefs }),
  setReviewPaceKind: (reviewPaceKind) => set({ reviewPaceKind }),
  setBatchSize: (batchSize) => set({ batchSize }),
  setScaffoldMode: (scaffoldMode) => set({ scaffoldMode }),
  setScaffoldId: (scaffoldId) => set({ scaffoldId }),
  setArea: (area) => set({ area }),
  setActiveRunId: (activeRunId) => set({ activeRunId }),
  setFocusedStudentRef: (focusedStudentRef) => set({ focusedStudentRef }),
}));

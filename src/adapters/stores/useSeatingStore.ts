import { create } from 'zustand';
import type { SeatingData } from '@domain/entities/Seating';
import type { SeatingLayout, SeatGroup } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { isStudentActive } from '@domain/rules/studentActivity';
import {
  countStudents,
  countEmptySeats,
  shuffleGroups,
  assignGroupsInOrder,
} from '@domain/rules/seatRules';
import type { ShuffleResult } from '@domain/rules/seatRules';
import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';
import type { SeatingSnapshot, SnapshotSource } from '@domain/entities/SeatingSnapshot';
import {
  seatingRepository,
  seatConstraintsRepository,
  seatingSnapshotRepository,
} from '@adapters/di/container';

/** "이전 자리 피하기" UI 강도. UI 라벨: off="OFF", prefer="가능하면", strict="반드시" */
export type AvoidHistoryStrength = 'off' | 'prefer' | 'strict';
import { SwapSeats } from '@usecases/seating/SwapSeats';
import { RandomizeSeats } from '@usecases/seating/RandomizeSeats';
import { UpdateSeating } from '@usecases/seating/UpdateSeating';
import { ClearSeating } from '@usecases/seating/ClearSeating';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';

/** 활성 학생(결번 제외) 수에 맞춰 동적 그리드 생성 */
function calcGridSize(activeCount: number): { rows: number; cols: number } {
  if (activeCount <= 0) return { rows: 1, cols: 1 };
  const cols = Math.ceil(Math.sqrt(activeCount));
  const rows = Math.ceil(activeCount / cols);
  return { rows, cols };
}

/** 학생 목록 기반 좌석 자동 생성 (결번 제외, 동적 크기) */
function createSeatingFromStudents(students: readonly Student[]): SeatingData {
  const activeIds = students.filter(isStudentActive).map((s) => s.id);
  const { rows, cols } = calcGridSize(activeIds.length);
  const seats: (string | null)[][] = [];
  let idx = 0;
  for (let r = 0; r < rows; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < cols; c++) {
      row.push(idx < activeIds.length ? (activeIds[idx] ?? null) : null);
      idx++;
    }
    seats.push(row);
  }
  return { rows, cols, seats };
}

/** 좌석에서 명렬표에 없거나 결번인 학생 ID를 제거하고, 새로 추가된 학생을 빈 자리에 배치 */
function sanitizeSeating(seating: SeatingData, students: readonly Student[]): SeatingData {
  const activeIds = new Set(students.filter(isStudentActive).map((s) => s.id));

  // 1단계: 비활성/결번 학생 제거
  let changed = false;
  let seats = seating.seats.map((row) =>
    row.map((cell) => {
      if (cell !== null && !activeIds.has(cell)) {
        changed = true;
        return null;
      }
      return cell;
    }),
  );

  // 2단계: 그리드에 없는 활성 학생 탐색
  const seatedIds = new Set(seats.flat().filter((cell): cell is string => cell !== null));
  const unplaced = [...activeIds].filter((id) => !seatedIds.has(id));

  if (unplaced.length === 0) {
    return changed ? { ...seating, seats } : seating;
  }

  changed = true;
  const queue = [...unplaced];

  // 3단계: 기존 빈 자리(null)에 미배치 학생 채우기
  seats = seats.map((row) =>
    row.map((cell) => {
      if (cell === null && queue.length > 0) {
        return queue.shift()!;
      }
      return cell;
    }),
  );

  // 4단계: 아직 남은 미배치 학생 → 새 행 추가
  if (queue.length > 0) {
    const cols = seating.cols;
    while (queue.length > 0) {
      const newRow: (string | null)[] = [];
      for (let c = 0; c < cols; c++) {
        newRow.push(queue.length > 0 ? queue.shift()! : null);
      }
      seats.push(newRow);
    }
  }

  const newRows = seats.length;
  return { ...seating, rows: newRows, seats };
}

interface SeatingState {
  seating: SeatingData;
  loaded: boolean;
  isEditing: boolean;

  past: SeatingData[];
  future: SeatingData[];

  load: () => Promise<void>;
  swapSeats: (r1: number, c1: number, r2: number, c2: number) => Promise<void>;
  randomize: () => Promise<ShuffleResult | null>;
  updateStudent: (row: number, col: number, studentId: string | null) => Promise<void>;
  setEditing: (editing: boolean) => void;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  clearAllSeats: () => Promise<void>;
  resizeGrid: (newRows: number, newCols: number) => Promise<void>;

  /** 짝꿍 모드 토글 */
  togglePairMode: () => Promise<void>;
  /** 홀수 열 처리 모드 토글 (single ↔ triple) */
  toggleOddColumnMode: () => Promise<void>;

  /** 레이아웃 모드 전환 (grid ↔ group) */
  changeLayout: (layout: SeatingLayout) => Promise<void>;
  /** 모둠 목록 업데이트 */
  updateGroups: (groups: SeatGroup[]) => Promise<void>;
  /** 모둠 셔플 (학생들을 모둠에 랜덤 분배) */
  shuffleGroupSeating: (groupCount: number, maxSize: number) => Promise<void>;
  /** 격자-모둠 연동 토글 */
  toggleGroupGridSync: () => Promise<void>;

  /** 명렬표 변경 시 좌석 동기화 */
  syncFromRoster: (students: readonly Student[]) => Promise<void>;
  /** 명렬표 전체 교체 시 좌석 재생성 */
  rebuildFromRoster: (students: readonly Student[]) => Promise<void>;

  /* ─── 자리배치 히스토리 (Phase 1) ─── */
  /** 저장된 스냅샷 목록 (최신순) */
  snapshots: readonly SeatingSnapshot[];
  snapshotsLoaded: boolean;
  /** 스냅샷 전체 로드 */
  loadSnapshots: () => Promise<void>;
  /** 현재 배치를 스냅샷으로 저장. label 미지정 시 자동 생성. */
  saveCurrentAsSnapshot: (label?: string, source?: SnapshotSource) => Promise<void>;
  /** 특정 스냅샷 ID로 좌석 복원 (sanitize 통과). */
  restoreSnapshot: (id: string) => Promise<void>;
  /** 스냅샷 삭제 */
  deleteSnapshot: (id: string) => Promise<void>;

  /* ─── "이전 자리 피하기" 강도 (Phase 2) ─── */
  /** off=비활성, prefer=가능하면, strict=반드시 */
  avoidHistoryStrength: AvoidHistoryStrength;
  setAvoidHistoryStrength: (strength: AvoidHistoryStrength) => void;

  /* ─── 우연을 가장한 배치 (Phase 3b) ─── */
  /** 교사가 미리 설정한 배치 — 다음 셔플 시 1회 적용 후 자동 소멸 */
  presetArrangement: SeatingData | null;
  presetLoaded: boolean;
  /** 저장소에서 프리셋 로드 */
  loadPreset: () => Promise<void>;
  /** 현재 배치를 프리셋으로 저장 */
  setPresetFromCurrent: () => Promise<void>;
  /** 프리셋 제거 (취소) */
  clearPreset: () => Promise<void>;
  /** 프리셋이 활성 상태인지 (UI 인디케이터용) */
  hasPreset: () => boolean;

  /** 파생 값 */
  studentCount: () => number;
  emptyCount: () => number;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const EMPTY_SEATING: SeatingData = { rows: 1, cols: 1, seats: [[null]] };

/** 같은 날짜인지 확인 (로컬 타임존 기준) */
function isSameDay(t1: number, t2: number): boolean {
  const d1 = new Date(t1);
  const d2 = new Date(t2);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/** 자동 라벨 생성. 예: "5/20 셔플 #3" */
function buildAutoLabel(
  source: SnapshotSource,
  todaySnapshots: readonly SeatingSnapshot[],
  now: number,
): string {
  const date = new Date(now);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const dateLabel = `${month}/${day}`;

  const sourceLabel: Record<SnapshotSource, string> = {
    shuffle: '셔플',
    manual: '저장',
    auto: '자동',
  };

  const todayCount = todaySnapshots.filter(
    (s) => s.source === source && isSameDay(s.timestamp, now),
  ).length;

  return `${dateLabel} ${sourceLabel[source]} #${todayCount + 1}`;
}

/** 스냅샷 ID 생성 — crypto.randomUUID 우선, 폴백은 timestamp + counter */
let snapshotIdCounter = 0;
function newSnapshotId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  snapshotIdCounter += 1;
  return `snap-${Date.now()}-${snapshotIdCounter}`;
}

export const useSeatingStore = create<SeatingState>((set, get) => {
  const swapSeatsUC = new SwapSeats(seatingRepository);
  const randomizeUC = new RandomizeSeats(
    seatingRepository,
    seatConstraintsRepository,
    seatingSnapshotRepository,
    () => {
      const strength = get().avoidHistoryStrength;
      return strength === 'off' ? undefined : { strength };
    },
  );
  const updateUC = new UpdateSeating(seatingRepository);
  const clearUC = new ClearSeating(seatingRepository);

  const pushToHistory = () => {
    const { seating, past } = get();
    const newPast = [...past, seating].slice(-20);
    set({ past: newPast, future: [] });
  };

  return {
    seating: EMPTY_SEATING,
    past: [],
    future: [],
    loaded: false,
    isEditing: false,
    snapshots: [],
    snapshotsLoaded: false,
    avoidHistoryStrength: 'off',
    presetArrangement: null,
    presetLoaded: false,

    load: async () => {
      if (get().loaded) return;
      try {
        // 학생 스토어가 먼저 로드되어야 함
        const studentState = useStudentStore.getState();
        if (!studentState.loaded) {
          await studentState.load();
        }
        const students = useStudentStore.getState().students;

        const data = await seatingRepository.getSeating();

        if (data !== null) {
          // 명렬표 기준으로 좌석 정합성 검증: 없는/결번 학생 ID 제거
          const sanitized = sanitizeSeating(data, students);
          if (sanitized !== data) {
            await seatingRepository.saveSeating(sanitized);
          }
          set({ seating: sanitized, loaded: true });
        } else {
          // 최초: 명렬표 기준 좌석 자동 생성
          const defaultData = createSeatingFromStudents(students);
          await seatingRepository.saveSeating(defaultData);
          set({ seating: defaultData, loaded: true });
        }
      } catch {
        set({ loaded: true });
      }
    },

    undo: async () => {
      const { past, future, seating } = get();
      if (past.length === 0) return;
      const prevSeating = past[past.length - 1]!;
      const newPast = past.slice(0, -1);
      const newFuture = [seating, ...future].slice(0, 20);

      try {
        await seatingRepository.saveSeating(prevSeating);
        set({ seating: prevSeating, past: newPast, future: newFuture });
      } catch {
        // 무시
      }
    },

    redo: async () => {
      const { past, future, seating } = get();
      if (future.length === 0) return;
      const nextSeating = future[0]!;
      const newFuture = future.slice(1);
      const newPast = [...past, seating].slice(-20);

      try {
        await seatingRepository.saveSeating(nextSeating);
        set({ seating: nextSeating, past: newPast, future: newFuture });
      } catch {
        // 무시
      }
    },

    swapSeats: async (r1, c1, r2, c2) => {
      try {
        pushToHistory();
        const updated = await swapSeatsUC.execute(r1, c1, r2, c2);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    randomize: async () => {
      try {
        pushToHistory();

        // Phase 3b: 프리셋이 있으면 실제 셔플 대신 프리셋을 적용 (1회 사용 후 자동 소멸)
        const preset = get().presetArrangement;
        if (preset) {
          // 현재 명렬표 기준 sanitize (졸업/전학 학생 좀비 ID 차단)
          const students = useStudentStore.getState().students;
          const restored = sanitizeSeating(preset, students);

          await seatingRepository.saveSeating(restored);
          await seatingRepository.clearPreset();
          set({ seating: restored, presetArrangement: null });

          // 자동 스냅샷 (외부 인식은 셔플과 동일)
          try {
            await get().saveCurrentAsSnapshot(undefined, 'shuffle');
          } catch {
            // 스냅샷 저장 실패는 무시
          }

          return {
            // ShuffleResult.seats 는 mutable 타입이므로 깊은 사본 반환
            seats: restored.seats.map((row) => [...row]),
            success: true,
            attempts: 1,
            relaxed: false,
            violations: [],
          };
        }

        // 일반 셔플 경로
        const { seating: updated, result } = await randomizeUC.execute();
        set({ seating: updated });
        if (result.success) {
          try {
            await get().saveCurrentAsSnapshot(undefined, 'shuffle');
          } catch {
            // 스냅샷 저장 실패는 무시 (셔플 결과는 이미 반영됨)
          }
        }
        return result;
      } catch {
        return null;
      }
    },

    updateStudent: async (row, col, studentId) => {
      try {
        pushToHistory();
        const updated = await updateUC.execute(row, col, studentId);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    clearAllSeats: async () => {
      try {
        pushToHistory();
        const updated = await clearUC.execute();
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    setEditing: (editing) => set({ isEditing: editing }),

    togglePairMode: async () => {
      const { seating } = get();
      const updated: SeatingData = { ...seating, pairMode: !seating.pairMode };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    toggleOddColumnMode: async () => {
      const { seating } = get();
      const current = seating.oddColumnMode ?? 'single';
      const next: OddColumnMode = current === 'single' ? 'triple' : 'single';
      const updated: SeatingData = { ...seating, oddColumnMode: next };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        // 무시
      }
    },

    changeLayout: async (layout) => {
      const { seating } = get();
      pushToHistory();
      const sync = seating.groupGridSync !== false; // 기본 true

      if (sync && layout === 'group' && (!seating.groups || seating.groups.length === 0)) {
        // 연동 모드 + grid → group (최초): 격자 학생을 모둠으로 자동 분배
        const allStudentIds = seating.seats.flat().filter((id): id is string => id !== null);
        const maxSize = 6;
        const groupCount = Math.max(1, Math.ceil(allStudentIds.length / maxSize));
        const groups = assignGroupsInOrder(allStudentIds, groupCount, maxSize);
        const updated: SeatingData = { ...seating, layout, groups };
        try {
          await seatingRepository.saveSeating(updated);
          set({ seating: updated });
        } catch {
          /* 무시 */
        }
      } else if (sync && layout === 'grid' && seating.layout === 'group') {
        // 연동 모드 + group → grid: 모둠 학생을 격자에 재배치
        const allStudentIds = (seating.groups ?? []).flatMap((g) => [...g.studentIds]);
        const cols = seating.cols;
        const rows = Math.max(seating.rows, Math.ceil(allStudentIds.length / cols));
        const seats: (string | null)[][] = [];
        let idx = 0;
        for (let r = 0; r < rows; r++) {
          const row: (string | null)[] = [];
          for (let c = 0; c < cols; c++) {
            row.push(idx < allStudentIds.length ? (allStudentIds[idx++] ?? null) : null);
          }
          seats.push(row);
        }
        const updated: SeatingData = { ...seating, layout, rows, seats };
        try {
          await seatingRepository.saveSeating(updated);
          set({ seating: updated });
        } catch {
          /* 무시 */
        }
      } else {
        // 비연동 모드 또는 이미 모둠이 존재: 레이아웃만 전환
        const updated: SeatingData = { ...seating, layout };
        try {
          await seatingRepository.saveSeating(updated);
          set({ seating: updated });
        } catch {
          /* 무시 */
        }
      }
    },

    updateGroups: async (groups) => {
      const { seating } = get();
      pushToHistory();
      const updated: SeatingData = { ...seating, groups };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    shuffleGroupSeating: async (groupCount, maxSize) => {
      const { seating } = get();
      pushToHistory();
      // 모든 학생 ID 수집 (격자 + 모둠)
      let allStudentIds: string[];
      if (seating.groups && seating.groups.length > 0) {
        allStudentIds = seating.groups.flatMap((g) => [...g.studentIds]);
      } else {
        allStudentIds = seating.seats.flat().filter((id): id is string => id !== null);
      }
      const groups = shuffleGroups(
        allStudentIds,
        groupCount,
        maxSize,
        seating.groups ?? [],
        Math.random,
      );
      const updated: SeatingData = { ...seating, layout: 'group' as SeatingLayout, groups };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    toggleGroupGridSync: async () => {
      const { seating } = get();
      const updated: SeatingData = { ...seating, groupGridSync: seating.groupGridSync === false };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    resizeGrid: async (newRows, newCols) => {
      const clampedRows = Math.max(1, Math.min(10, newRows));
      const clampedCols = Math.max(1, Math.min(10, newCols));
      const { seating } = get();

      pushToHistory();

      // Build new seats array preserving existing students
      const newSeats: (string | null)[][] = [];
      for (let r = 0; r < clampedRows; r++) {
        const existingRow = r < seating.seats.length ? seating.seats[r] : [];
        const newRow: (string | null)[] = [];
        for (let c = 0; c < clampedCols; c++) {
          const existingCell =
            existingRow && c < existingRow.length ? (existingRow[c] ?? null) : null;
          newRow.push(existingCell);
        }
        newSeats.push(newRow);
      }

      let updated: SeatingData = {
        rows: clampedRows,
        cols: clampedCols,
        seats: newSeats,
        pairMode: seating.pairMode,
        oddColumnMode: seating.oddColumnMode,
      };

      // 잘려나간 영역의 학생을 빈 자리에 재배치
      const students = useStudentStore.getState().students;
      updated = sanitizeSeating(updated, students);

      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
        await useSettingsStore
          .getState()
          .update({ seatingRows: updated.rows, seatingCols: updated.cols });
      } catch {
        // 무시
      }
    },

    syncFromRoster: async (students) => {
      const { seating } = get();
      const sanitized = sanitizeSeating(seating, students);

      if (sanitized !== seating) {
        // 좌석 변동 발생 → 백업 스냅샷 자동 저장 (source='auto')
        try {
          await get().saveCurrentAsSnapshot(undefined, 'auto');
        } catch {
          // 백업 실패는 무시 (동기화는 계속 진행)
        }
        try {
          await seatingRepository.saveSeating(sanitized);
          set({ seating: sanitized });
        } catch {
          // 무시
        }
      }
    },

    rebuildFromRoster: async (students) => {
      const newSeating = createSeatingFromStudents(students);
      try {
        await seatingRepository.saveSeating(newSeating);
        set({ seating: newSeating, past: [], future: [] });
        await useSettingsStore.getState().update({
          seatingRows: newSeating.rows,
          seatingCols: newSeating.cols,
        });
      } catch {
        // 무시
      }
    },

    /* ─── 자리배치 히스토리 (Phase 1) ─── */

    loadSnapshots: async () => {
      if (get().snapshotsLoaded) return;
      try {
        const list = await seatingSnapshotRepository.getSnapshots();
        set({ snapshots: list, snapshotsLoaded: true });
      } catch {
        set({ snapshotsLoaded: true });
      }
    },

    saveCurrentAsSnapshot: async (label, source = 'manual') => {
      const { seating, snapshots } = get();
      const now = Date.now();
      const finalLabel =
        label && label.trim().length > 0 ? label.trim() : buildAutoLabel(source, snapshots, now);

      const snapshot: SeatingSnapshot = {
        id: newSnapshotId(),
        timestamp: now,
        label: finalLabel,
        source,
        // 깊은 사본: seats 2D 배열까지 복제하여 이후 변경 영향 차단
        seating: {
          ...seating,
          seats: seating.seats.map((row) => [...row]),
          groups: seating.groups
            ? seating.groups.map((g) => ({ ...g, studentIds: [...g.studentIds] }))
            : undefined,
        },
      };

      try {
        await seatingSnapshotRepository.saveSnapshot(snapshot);
        const refreshed = await seatingSnapshotRepository.getSnapshots();
        set({ snapshots: refreshed, snapshotsLoaded: true });
      } catch {
        // 무시
      }
    },

    restoreSnapshot: async (id) => {
      const target = get().snapshots.find((s) => s.id === id);
      if (!target) return;

      pushToHistory();

      try {
        // 졸업/전학 학생 좀비 ID 방지 — 현재 명렬표 기준 sanitize
        const students = useStudentStore.getState().students;
        const restored = sanitizeSeating(target.seating, students);
        await seatingRepository.saveSeating(restored);
        set({ seating: restored });
      } catch {
        // 무시
      }
    },

    deleteSnapshot: async (id) => {
      try {
        await seatingSnapshotRepository.deleteSnapshot(id);
        const refreshed = await seatingSnapshotRepository.getSnapshots();
        set({ snapshots: refreshed });
      } catch {
        // 무시
      }
    },

    /* ─── "이전 자리 피하기" 강도 (Phase 2) ─── */

    setAvoidHistoryStrength: (strength) => {
      set({ avoidHistoryStrength: strength });
    },

    /* ─── 우연을 가장한 배치 (Phase 3b) ─── */

    loadPreset: async () => {
      if (get().presetLoaded) return;
      try {
        const preset = await seatingRepository.getPreset();
        set({ presetArrangement: preset, presetLoaded: true });
      } catch {
        set({ presetLoaded: true });
      }
    },

    setPresetFromCurrent: async () => {
      const { seating } = get();
      // 깊은 사본 — 현재 배치가 이후 변경돼도 프리셋 보존
      const snapshot: SeatingData = {
        ...seating,
        seats: seating.seats.map((row) => [...row]),
        groups: seating.groups
          ? seating.groups.map((g) => ({ ...g, studentIds: [...g.studentIds] }))
          : undefined,
      };
      try {
        await seatingRepository.savePreset(snapshot);
        set({ presetArrangement: snapshot, presetLoaded: true });
      } catch {
        // 무시
      }
    },

    clearPreset: async () => {
      try {
        await seatingRepository.clearPreset();
        set({ presetArrangement: null });
      } catch {
        // 무시
      }
    },

    hasPreset: () => get().presetArrangement !== null,

    studentCount: () => countStudents(get().seating.seats),
    emptyCount: () => countEmptySeats(get().seating.seats),
    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
});

/** 명렬표 변경 구독: 학생 변경 시 좌석 자동 동기화 */
useStudentStore.subscribe((state, prevState) => {
  if (state.students !== prevState.students && useSeatingStore.getState().loaded) {
    void useSeatingStore.getState().syncFromRoster(state.students);
  }
});

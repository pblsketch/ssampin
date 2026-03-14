import { create } from 'zustand';
import type { SeatingData } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';
import { countStudents, countEmptySeats } from '@domain/rules/seatRules';
import type { ShuffleResult } from '@domain/rules/seatRules';
import type { OddColumnMode } from '@domain/rules/seatingLayoutRules';
import { seatingRepository, seatConstraintsRepository } from '@adapters/di/container';
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
  const activeIds = students.filter((s) => !s.isVacant).map((s) => s.id);
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
function sanitizeSeating(
  seating: SeatingData,
  students: readonly Student[],
): SeatingData {
  const activeIds = new Set(
    students.filter((s) => !s.isVacant).map((s) => s.id),
  );

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
  let queue = [...unplaced];

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
        newRow.push(queue.length > 0 ? (queue.shift()!) : null);
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

  /** 명렬표 변경 시 좌석 동기화 */
  syncFromRoster: (students: readonly Student[]) => Promise<void>;
  /** 명렬표 전체 교체 시 좌석 재생성 */
  rebuildFromRoster: (students: readonly Student[]) => Promise<void>;

  /** 파생 값 */
  studentCount: () => number;
  emptyCount: () => number;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

const EMPTY_SEATING: SeatingData = { rows: 1, cols: 1, seats: [[null]] };

export const useSeatingStore = create<SeatingState>((set, get) => {
  const swapSeatsUC = new SwapSeats(seatingRepository);
  const randomizeUC = new RandomizeSeats(seatingRepository, seatConstraintsRepository);
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
        const { seating: updated, result } = await randomizeUC.execute();
        set({ seating: updated });
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
          const existingCell = existingRow && c < existingRow.length ? (existingRow[c] ?? null) : null;
          newRow.push(existingCell);
        }
        newSeats.push(newRow);
      }

      let updated: SeatingData = { rows: clampedRows, cols: clampedCols, seats: newSeats, pairMode: seating.pairMode, oddColumnMode: seating.oddColumnMode };

      // 잘려나간 영역의 학생을 빈 자리에 재배치
      const students = useStudentStore.getState().students;
      updated = sanitizeSeating(updated, students);

      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
        await useSettingsStore.getState().update({ seatingRows: updated.rows, seatingCols: updated.cols });
      } catch {
        // 무시
      }
    },

    syncFromRoster: async (students) => {
      const { seating } = get();
      const sanitized = sanitizeSeating(seating, students);

      if (sanitized !== seating) {
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

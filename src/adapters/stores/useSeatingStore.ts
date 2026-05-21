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
  sanitizeGroups,
} from '@domain/rules/seatRules';
import type { ShuffleResult } from '@domain/rules/seatRules';
import {
  sanitizeFreestyleDesks,
  cloneFreestyleDesks,
  generateFreestyleDesks,
  shuffleFreestyleStudents,
} from '@domain/rules/freestyleRules';
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

/**
 * freestyleDesks sanitize 를 SeatingData 에 적용한다.
 * grid/group 모드에서도 freestyleDesks 가 보존될 수 있으므로 (mode 토글 데이터 손실 0 정책),
 * freestyleDesks 가 존재하면 항상 sanitize 한다. 변경 없으면 원본 참조 그대로 반환.
 */
function applyFreestyleSanitize(seating: SeatingData, students: readonly Student[]): SeatingData {
  if (!seating.freestyleDesks || seating.freestyleDesks.length === 0) return seating;
  const sanitized = sanitizeFreestyleDesks(seating.freestyleDesks, students);
  return sanitized === seating.freestyleDesks ? seating : { ...seating, freestyleDesks: sanitized };
}

/**
 * 모둠의 stale studentIds 를 제거한다. 비연동 모드 + 졸업/전학 발생 시 회귀 차단용.
 * 모둠 슬롯 구조(이름/색/maxSize)는 보존하고, 더 이상 명렬표에 없는 학생 ID 만 제거한다.
 * 변경 없으면 원본 참조 그대로 반환.
 */
function applyGroupsSanitize(seating: SeatingData, students: readonly Student[]): SeatingData {
  if (!seating.groups || seating.groups.length === 0) return seating;
  const activeIds = new Set(students.filter(isStudentActive).map((s) => s.id));
  const sanitized = sanitizeGroups(seating.groups, activeIds);
  return sanitized === seating.groups ? seating : { ...seating, groups: sanitized };
}

/**
 * 'group' 레이아웃인데 모든 모둠이 비어 있고 격자에 학생이 있으면 격자 학생으로 자동 채워 복구한다.
 * cluster-fix 핫픽스 (load 경로 회복) — 이전 빌드의 stale studentIds 가 sanitize 로 전부 제거된
 * 상태에서 새 빌드로 진입했을 때, 사용자가 추가 조작 없이 새로고침만으로 모둠이 살아나도록.
 * 변경 없으면 입력 참조 그대로 반환.
 */
function repairEmptyGroupsFromSeats(
  seating: SeatingData,
  students: readonly Student[],
): SeatingData {
  if (seating.layout !== 'group') return seating;
  if (!seating.groups || seating.groups.length === 0) return seating;
  const allEmpty = seating.groups.every((g) => g.studentIds.length === 0);
  if (!allEmpty) return seating;
  const activeIdSet = new Set(students.filter(isStudentActive).map((s) => s.id));
  const allStudentIds = seating.seats
    .flat()
    .filter((id): id is string => id !== null && activeIdSet.has(id));
  if (allStudentIds.length === 0) return seating;

  // 기존 모둠 구조(이름/색/maxSize)를 유지하면서 학생만 채운다.
  const existing = seating.groups;
  const maxSize = existing[0]?.maxSize ?? 6;
  const filled = assignGroupsInOrder(allStudentIds, existing.length, maxSize).map((g, i) => {
    const base = existing[i]!;
    return { ...base, studentIds: g.studentIds, maxSize: base.maxSize ?? maxSize };
  });
  return { ...seating, groups: filled };
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
    const base = changed ? { ...seating, seats } : seating;
    return applyGroupsSanitize(applyFreestyleSanitize(base, students), students);
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
  const result: SeatingData = { ...seating, rows: newRows, seats };

  // 5단계 (Phase 1 신규): freestyle 모드의 책상 sanitize.
  // 6단계 (cluster-fix 핫픽스): 모둠의 stale studentIds 도 함께 제거.
  return applyGroupsSanitize(applyFreestyleSanitize(result, students), students);
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

  /* ─── 자유 배치 (Phase 4) ─── */
  /** 자유 배치 프리셋 적용 — 사용자가 다이얼로그에서 선택한 프리셋을 freestyleDesks 로 재생성 */
  applyFreestylePreset: (
    params: import('@domain/rules/freestyleRules').FreestylePresetParams,
  ) => Promise<void>;
  /** 책상 위치 이동 (드래그) — id 로 desk 를 찾아 x/y 만 업데이트 */
  moveFreestyleDesk: (deskId: string, x: number, y: number) => Promise<void>;
  /** 여러 책상을 한 번에 이동 (Figma 스타일 그룹 드래그) — 각 desk 별 새 x/y 적용 */
  moveMultipleFreestyleDesks: (
    updates: ReadonlyArray<{ id: string; x: number; y: number }>,
  ) => Promise<void>;
  /** 두 책상 사이 학생 교환 (위치는 그대로, studentId 만 swap) */
  swapFreestyleStudents: (deskA: string, deskB: string) => Promise<void>;

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

  /**
   * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
   *
   * 현재 좌석(grid + groups + freestyleDesks 모두)에서 주어진 학생 ID 집합이
   * 한 번이라도 참조되는지 카운트한다. 한 학생이 grid·groups·freestyle 세 군데에
   * 동시에 있을 수 있으므로 중복 카운트를 막기 위해 학생 단위로 unique set 처리한다.
   */
  hasStudentReferences: (studentIds: readonly string[]) => number;
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
          let sanitized = sanitizeSeating(data, students);
          // cluster-fix 핫픽스: 'group' 레이아웃 + 모든 모둠 0명 + 격자엔 학생 존재 → 자동 복구
          sanitized = repairEmptyGroupsFromSeats(sanitized, students);
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

        // Phase 5a: freestyle 모드는 책상 위치 고정 + 학생만 셔플
        // (grid 모드의 4종 제약조건은 Phase 5b 에서 마이그레이션 — 본 단계는 책상 위치만 보존)
        const current = get().seating;
        if (
          current.layout === 'freestyle' &&
          current.freestyleDesks &&
          current.freestyleDesks.length > 0
        ) {
          const shuffledDesks = shuffleFreestyleStudents(current.freestyleDesks);
          const updated: SeatingData = { ...current, freestyleDesks: shuffledDesks };
          await seatingRepository.saveSeating(updated);
          set({ seating: updated });
          try {
            await get().saveCurrentAsSnapshot(undefined, 'shuffle');
          } catch {
            /* 스냅샷 실패는 무시 */
          }
          return {
            seats: updated.seats.map((row) => [...row]),
            success: true,
            attempts: 1,
            relaxed: false,
            violations: [],
          };
        }

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

      // Phase 3 (freestyle): freestyle 전환 시 freestyleDesks 가 비어있으면 자동 시험 대형 프리셋 생성.
      // 학번(studentNumber) 오름차순으로 정렬해 좌측 첫 줄부터 1번 배치.
      if (
        layout === 'freestyle' &&
        (!seating.freestyleDesks || seating.freestyleDesks.length === 0)
      ) {
        const allStudentIds = seating.seats.flat().filter((id): id is string => id !== null);
        if (allStudentIds.length === 0 && seating.groups) {
          // grid 가 비어있으면 모둠에서 학생 ID 가져옴
          allStudentIds.push(...seating.groups.flatMap((g) => [...g.studentIds]));
        }
        // 학번 오름차순 정렬 (학번 없는 학생은 끝)
        const studentMap = new Map(useStudentStore.getState().students.map((s) => [s.id, s]));
        const sortedIds = [...allStudentIds].sort((a, b) => {
          const na = studentMap.get(a)?.studentNumber ?? Number.POSITIVE_INFINITY;
          const nb = studentMap.get(b)?.studentNumber ?? Number.POSITIVE_INFINITY;
          return na - nb;
        });
        const desks =
          sortedIds.length > 0
            ? generateFreestyleDesks({
                type: 'exam',
                studentCount: sortedIds.length,
                columns: Math.min(7, Math.max(4, seating.cols)),
                studentIds: sortedIds,
                numberDirection: 'left-to-right',
              })
            : [];
        const updated: SeatingData = {
          ...seating,
          layout,
          freestyleDesks: desks,
          freestylePreset: 'exam',
        };
        try {
          await seatingRepository.saveSeating(updated);
          set({ seating: updated });
        } catch {
          /* 무시 */
        }
        return;
      }

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
        // ── cluster-fix 핫픽스 ──
        // 비연동이어도 "모둠 화면에 진입했는데 모둠이 비어 있다" 면 격자 학생으로 1회 초기화한다.
        // (groups 자체가 없거나, 모든 모둠의 studentIds 가 0명이거나 — 후자는 stale ID 가 sanitize 로 전부 제거된 회귀 케이스)
        // 사용자가 의도적으로 학생이 든 모둠을 만들어 둔 경우(groups 중 하나라도 학생이 있음)는 건드리지 않는다.
        const allEmptyGroups =
          seating.groups !== undefined &&
          seating.groups.length > 0 &&
          seating.groups.every((g) => g.studentIds.length === 0);
        if (
          !sync &&
          layout === 'group' &&
          (!seating.groups || seating.groups.length === 0 || allEmptyGroups)
        ) {
          const allStudentIds = seating.seats.flat().filter((id): id is string => id !== null);
          if (allStudentIds.length > 0) {
            const existing = seating.groups ?? [];
            // 빈 모둠 구조(이름/색)는 보존하고 학생만 채워 넣는다.
            const maxSize = existing[0]?.maxSize ?? 6;
            const targetCount =
              existing.length > 0
                ? existing.length
                : Math.max(1, Math.ceil(allStudentIds.length / maxSize));
            const autoGroups = assignGroupsInOrder(allStudentIds, targetCount, maxSize).map(
              (g, i) => {
                const base = existing[i];
                return base
                  ? { ...base, studentIds: g.studentIds, maxSize: base.maxSize ?? maxSize }
                  : g;
              },
            );
            const updated: SeatingData = { ...seating, layout, groups: autoGroups };
            try {
              await seatingRepository.saveSeating(updated);
              set({ seating: updated });
            } catch {
              /* 무시 */
            }
            return;
          }
        }
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
      // 모든 학생 ID 수집 — 모둠에 학생이 한 명이라도 있으면 그쪽 우선, 아니면 격자에서.
      // cluster-fix: 기존 코드는 `groups.length > 0` 만 검사해 "구조는 있는데 학생은 전원 stale" 케이스에서
      // 빈 모둠을 그대로 셔플 → GroupShuffleOverlay 가 무한 대기하던 회귀를 차단.
      const fromGroups = seating.groups ? seating.groups.flatMap((g) => [...g.studentIds]) : [];
      const fromSeats = seating.seats.flat().filter((id): id is string => id !== null);
      const allStudentIds = fromGroups.length > 0 ? fromGroups : fromSeats;
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

    /* ─── 자유 배치 액션 (Phase 4) ─── */

    applyFreestylePreset: async (params) => {
      const { seating } = get();
      pushToHistory();
      // 학생 ID 자동 수집 (params.studentIds 미지정 시 현재 좌석/모둠/freestyle 에서 추출)
      let studentIds: string[] = params.studentIds ? [...params.studentIds] : [];
      if (studentIds.length === 0) {
        studentIds = seating.seats.flat().filter((id): id is string => id !== null);
        if (studentIds.length === 0 && seating.groups) {
          studentIds = seating.groups.flatMap((g) => [...g.studentIds]);
        }
        if (studentIds.length === 0 && seating.freestyleDesks) {
          studentIds = seating.freestyleDesks
            .map((d) => d.studentId)
            .filter((id): id is string => id !== null);
        }
      }
      const desks = generateFreestyleDesks({
        ...params,
        studentCount: params.studentCount > 0 ? params.studentCount : studentIds.length,
        studentIds,
      });
      const updated: SeatingData = {
        ...seating,
        layout: 'freestyle',
        freestyleDesks: desks,
        freestylePreset: params.type,
      };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    moveFreestyleDesk: async (deskId, x, y) => {
      const { seating } = get();
      if (!seating.freestyleDesks) return;
      const clampedX = Math.max(0, Math.min(1000, x));
      const clampedY = Math.max(0, Math.min(1000, y));
      const nextDesks = seating.freestyleDesks.map((d) =>
        d.id === deskId ? { ...d, x: clampedX, y: clampedY } : d,
      );
      const updated: SeatingData = { ...seating, freestyleDesks: nextDesks };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    moveMultipleFreestyleDesks: async (updates) => {
      const { seating } = get();
      if (!seating.freestyleDesks || updates.length === 0) return;
      // 변경 대상 id 맵 (각 id 별 새 x/y)
      const updateMap = new Map<string, { x: number; y: number }>();
      for (const u of updates) {
        updateMap.set(u.id, {
          x: Math.max(0, Math.min(1000, u.x)),
          y: Math.max(0, Math.min(1000, u.y)),
        });
      }
      pushToHistory();
      const nextDesks = seating.freestyleDesks.map((d) => {
        const target = updateMap.get(d.id);
        return target ? { ...d, x: target.x, y: target.y } : d;
      });
      const updated: SeatingData = { ...seating, freestyleDesks: nextDesks };
      try {
        await seatingRepository.saveSeating(updated);
        set({ seating: updated });
      } catch {
        /* 무시 */
      }
    },

    swapFreestyleStudents: async (deskA, deskB) => {
      const { seating } = get();
      if (!seating.freestyleDesks || deskA === deskB) return;
      const a = seating.freestyleDesks.find((d) => d.id === deskA);
      const b = seating.freestyleDesks.find((d) => d.id === deskB);
      if (!a || !b) return;
      pushToHistory();
      const nextDesks = seating.freestyleDesks.map((d) => {
        if (d.id === deskA) return { ...d, studentId: b.studentId };
        if (d.id === deskB) return { ...d, studentId: a.studentId };
        return d;
      });
      const updated: SeatingData = { ...seating, freestyleDesks: nextDesks };
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
          // Phase 1 신규 — freestyleDesks 도 깊은 사본 (P0-2 참조 공유 회귀 차단)
          freestyleDesks: cloneFreestyleDesks(seating.freestyleDesks),
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
        // Phase 1 신규 — freestyleDesks 도 깊은 사본 (참조 공유 차단, 스냅샷과 동일 정책)
        freestyleDesks: cloneFreestyleDesks(seating.freestyleDesks),
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

    /**
     * roster-sample-data-removal Phase 2 — 외부 참조 검사 (가드 D).
     *
     * grid(seats), groups, freestyleDesks 세 컨테이너 모두에서 참조 카운트.
     * 한 학생이 여러 컨테이너에 동시에 박혀 있어도 1로만 센다 (unique set).
     */
    hasStudentReferences: (studentIds) => {
      if (studentIds.length === 0) return 0;
      const targetSet = new Set(studentIds);
      const matched = new Set<string>();
      const { seating } = get();

      // 1) grid seats
      for (const row of seating.seats) {
        for (const cell of row) {
          if (cell !== null && targetSet.has(cell)) {
            matched.add(cell);
          }
        }
      }
      // 2) groups
      if (seating.groups) {
        for (const g of seating.groups) {
          for (const sid of g.studentIds) {
            if (targetSet.has(sid)) {
              matched.add(sid);
            }
          }
        }
      }
      // 3) freestyle desks
      if (seating.freestyleDesks) {
        for (const desk of seating.freestyleDesks) {
          if (desk.studentId && targetSet.has(desk.studentId)) {
            matched.add(desk.studentId);
          }
        }
      }
      return matched.size;
    },
  };
});

/** 명렬표 변경 구독: 학생 변경 시 좌석 자동 동기화 */
useStudentStore.subscribe((state, prevState) => {
  if (state.students !== prevState.students && useSeatingStore.getState().loaded) {
    void useSeatingStore.getState().syncFromRoster(state.students);
  }
});

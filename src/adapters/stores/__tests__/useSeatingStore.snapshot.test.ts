/**
 * useSeatingStore 의 스냅샷(자리배치 히스토리) 통합 동작을 검증한다.
 *
 * - randomize() 성공 시 source='shuffle' 자동 스냅샷 생성
 * - saveCurrentAsSnapshot(manual) 라벨 자동 생성 + 목록 갱신
 * - restoreSnapshot — sanitizeSeating 통과(졸업 학생 ID 좀비 제거)
 * - deleteSnapshot — 목록에서 제거, 미존재 ID no-op
 * - syncFromRoster 로 좌석 변동 발생 시 source='auto' 백업
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { SeatingData } from '@domain/entities/Seating';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';
import type { Student } from '@domain/entities/Student';

// ── 메모리 fake repositories (vi.hoisted 로 mock factory 보다 먼저 평가) ──

const { seatingFake, constraintsFake, snapshotFake, studentsRef, settingsRef } = vi.hoisted(() => {
  const seatingFakeRef: { seating: SeatingData | null } & {
    getSeating(): Promise<SeatingData | null>;
    saveSeating(data: SeatingData): Promise<void>;
  } = {
    seating: null,
    async getSeating() {
      return this.seating;
    },
    async saveSeating(data: SeatingData) {
      this.seating = data;
    },
  };

  const constraintsFakeRef = {
    async getConstraints() {
      return { fixedSeats: [], zones: [], separations: [], adjacencies: [] };
    },
    async saveConstraints() {},
  };

  const snapshotFakeRef: { snapshots: SeatingSnapshot[] } & {
    getSnapshots(): Promise<readonly SeatingSnapshot[]>;
    saveSnapshot(snap: SeatingSnapshot): Promise<void>;
    deleteSnapshot(id: string): Promise<void>;
    clearAll(): Promise<void>;
  } = {
    snapshots: [],
    async getSnapshots() {
      return [...this.snapshots].sort((a, b) => b.timestamp - a.timestamp);
    },
    async saveSnapshot(snap: SeatingSnapshot) {
      this.snapshots = [snap, ...this.snapshots].slice(0, 50);
    },
    async deleteSnapshot(id: string) {
      this.snapshots = this.snapshots.filter((s) => s.id !== id);
    },
    async clearAll() {
      this.snapshots = [];
    },
  };

  const studentsRefObj: { students: Student[] } = { students: [] };
  const settingsRefObj = { update: vi.fn().mockResolvedValue(undefined) };

  return {
    seatingFake: seatingFakeRef,
    constraintsFake: constraintsFakeRef,
    snapshotFake: snapshotFakeRef,
    studentsRef: studentsRefObj,
    settingsRef: settingsRefObj,
  };
});

// ── mock 설정 ──────────────────────────────────────────────────────────

vi.mock('@adapters/di/container', () => ({
  seatingRepository: seatingFake,
  seatConstraintsRepository: constraintsFake,
  seatingSnapshotRepository: snapshotFake,
}));

vi.mock('@adapters/stores/useStudentStore', () => ({
  useStudentStore: {
    getState: () => ({
      students: studentsRef.students,
      loaded: true,
      async load() {},
    }),
    subscribe: () => () => {},
  },
}));

vi.mock('@adapters/stores/useSettingsStore', () => ({
  useSettingsStore: {
    getState: () => settingsRef,
  },
}));

// mock 후 import (top-level 순서 보장)
import { useSeatingStore } from '../useSeatingStore';

// ── 헬퍼 ────────────────────────────────────────────────────────────────

function makeStudent(id: string, number: number, name: string): Student {
  return {
    id,
    studentNumber: number,
    name,
  };
}

const STUDENTS_3: readonly Student[] = [
  makeStudent('s1', 1, '학생1'),
  makeStudent('s2', 2, '학생2'),
  makeStudent('s3', 3, '학생3'),
];

const SEATING_3x1: SeatingData = {
  rows: 3,
  cols: 1,
  seats: [['s1'], ['s2'], ['s3']],
};

// ── 초기화 ──────────────────────────────────────────────────────────────

beforeEach(() => {
  seatingFake.seating = SEATING_3x1;
  snapshotFake.snapshots = [];
  studentsRef.students = [...STUDENTS_3];
  settingsRef.update.mockClear();

  useSeatingStore.setState({
    seating: SEATING_3x1,
    past: [],
    future: [],
    loaded: true,
    isEditing: false,
    snapshots: [],
    snapshotsLoaded: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── 테스트 ──────────────────────────────────────────────────────────────

describe('useSeatingStore — snapshots', () => {
  describe('loadSnapshots', () => {
    it('빈 저장소에서 로드 시 빈 배열 + loaded=true', async () => {
      await useSeatingStore.getState().loadSnapshots();
      expect(useSeatingStore.getState().snapshots).toEqual([]);
      expect(useSeatingStore.getState().snapshotsLoaded).toBe(true);
    });

    it('저장소의 스냅샷을 최신순으로 로드한다', async () => {
      snapshotFake.snapshots = [
        {
          id: 'a',
          timestamp: 100,
          label: 'old',
          source: 'manual',
          seating: SEATING_3x1,
        },
        {
          id: 'b',
          timestamp: 300,
          label: 'new',
          source: 'manual',
          seating: SEATING_3x1,
        },
      ];

      await useSeatingStore.getState().loadSnapshots();
      const list = useSeatingStore.getState().snapshots;
      expect(list.map((s) => s.id)).toEqual(['b', 'a']);
    });

    it('이미 loaded=true 면 재로드하지 않는다', async () => {
      useSeatingStore.setState({ snapshotsLoaded: true, snapshots: [] });
      snapshotFake.snapshots = [
        { id: 'x', timestamp: 1, label: 't', source: 'manual', seating: SEATING_3x1 },
      ];
      await useSeatingStore.getState().loadSnapshots();
      // 이미 로드된 것으로 간주 → 빈 배열 유지
      expect(useSeatingStore.getState().snapshots).toEqual([]);
    });
  });

  describe('saveCurrentAsSnapshot', () => {
    it('수동 저장 — 자동 라벨 "M/D 저장 #1" 생성, 깊은 사본', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot();

      const list = useSeatingStore.getState().snapshots;
      expect(list).toHaveLength(1);

      const saved = list[0]!;
      expect(saved.source).toBe('manual');
      expect(saved.label).toMatch(/^\d+\/\d+ 저장 #1$/);

      // 깊은 사본: 이후 원본 변경이 스냅샷에 영향을 주지 않아야 함
      const originalSeats = useSeatingStore.getState().seating.seats;
      expect(saved.seating.seats).not.toBe(originalSeats);
      expect(saved.seating.seats[0]).not.toBe(originalSeats[0]);
    });

    it('같은 날 같은 source 누적 시 카운터 증가', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot();
      await useSeatingStore.getState().saveCurrentAsSnapshot();
      await useSeatingStore.getState().saveCurrentAsSnapshot();

      const list = useSeatingStore.getState().snapshots;
      expect(list).toHaveLength(3);
      // 최신순이므로 #3, #2, #1 순서
      expect(list[0]?.label).toMatch(/#3$/);
      expect(list[1]?.label).toMatch(/#2$/);
      expect(list[2]?.label).toMatch(/#1$/);
    });

    it('사용자 입력 라벨이 있으면 자동 라벨 무시', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot('  내 라벨  ', 'manual');
      const list = useSeatingStore.getState().snapshots;
      expect(list[0]?.label).toBe('내 라벨'); // trim
    });

    it('source 별 라벨: shuffle → "셔플", auto → "자동"', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot(undefined, 'shuffle');
      await useSeatingStore.getState().saveCurrentAsSnapshot(undefined, 'auto');

      const list = useSeatingStore.getState().snapshots;
      expect(list.find((s) => s.source === 'shuffle')?.label).toMatch(/셔플 #1$/);
      expect(list.find((s) => s.source === 'auto')?.label).toMatch(/자동 #1$/);
    });
  });

  describe('restoreSnapshot', () => {
    it('복원 시 좌석이 정확히 되돌아간다', async () => {
      // 다른 배치로 변경 후 스냅샷 1개 저장
      const OTHER: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s2'], ['s3'], ['s1']],
      };
      await useSeatingStore.getState().saveCurrentAsSnapshot('start', 'manual');
      seatingFake.seating = OTHER;
      useSeatingStore.setState({ seating: OTHER });

      const snapId = useSeatingStore.getState().snapshots[0]!.id;
      await useSeatingStore.getState().restoreSnapshot(snapId);

      const restored = useSeatingStore.getState().seating;
      expect(restored.seats).toEqual([['s1'], ['s2'], ['s3']]);
    });

    it('미존재 ID 복원 시도는 no-op (오류 없음, 좌석 유지)', async () => {
      const before = useSeatingStore.getState().seating;
      await useSeatingStore.getState().restoreSnapshot('nonexistent');
      expect(useSeatingStore.getState().seating).toBe(before);
    });

    it('졸업/전학으로 학생이 없어지면 sanitize 통과 — 좀비 ID 제거 + 빈 자리', async () => {
      // 현재 명렬표에 s1,s2,s3 있는 상태에서 스냅샷 저장
      await useSeatingStore.getState().saveCurrentAsSnapshot('before-graduation');
      const snapId = useSeatingStore.getState().snapshots[0]!.id;

      // s3 졸업 → 명렬표에서 제거
      studentsRef.students = [makeStudent('s1', 1, '학생1'), makeStudent('s2', 2, '학생2')];

      await useSeatingStore.getState().restoreSnapshot(snapId);

      const restored = useSeatingStore.getState().seating;
      // s3 자리는 null 로 sanitize 됨 (좀비 ID 차단)
      const flat = restored.seats.flat();
      expect(flat).not.toContain('s3');
      expect(flat).toContain('s1');
      expect(flat).toContain('s2');
    });

    it('past 히스토리에 현재 좌석을 push 한 후 복원 → undo 가능 상태', async () => {
      const OTHER: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s2'], ['s3'], ['s1']],
      };
      await useSeatingStore.getState().saveCurrentAsSnapshot();
      seatingFake.seating = OTHER;
      useSeatingStore.setState({ seating: OTHER });

      const snapId = useSeatingStore.getState().snapshots[0]!.id;
      await useSeatingStore.getState().restoreSnapshot(snapId);

      expect(useSeatingStore.getState().canUndo()).toBe(true);
    });
  });

  describe('deleteSnapshot', () => {
    it('해당 ID 만 삭제, 나머지 유지', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot('one');
      await useSeatingStore.getState().saveCurrentAsSnapshot('two');
      const ids = useSeatingStore.getState().snapshots.map((s) => s.id);
      const targetId = ids[0]!;

      await useSeatingStore.getState().deleteSnapshot(targetId);

      const remaining = useSeatingStore.getState().snapshots;
      expect(remaining).toHaveLength(1);
      expect(remaining.map((s) => s.id)).not.toContain(targetId);
    });

    it('미존재 ID 는 no-op', async () => {
      await useSeatingStore.getState().saveCurrentAsSnapshot('keep');
      await expect(useSeatingStore.getState().deleteSnapshot('nope')).resolves.toBeUndefined();
      expect(useSeatingStore.getState().snapshots).toHaveLength(1);
    });
  });

  describe('randomize 자동 스냅샷 통합', () => {
    it('randomize 성공 시 source="shuffle" 스냅샷 자동 생성', async () => {
      const result = await useSeatingStore.getState().randomize();
      expect(result?.success).toBe(true);

      const list = useSeatingStore.getState().snapshots;
      expect(list).toHaveLength(1);
      expect(list[0]?.source).toBe('shuffle');
      expect(list[0]?.label).toMatch(/셔플 #1$/);
    });
  });

  describe('F8b(RM-a) — 학년도 전환의 빈 유효 표현 load 안전성', () => {
    it('격자 승계형(rows/cols 유지 + seats 전부 null, 학생 0명) load가 안전하다', async () => {
      // ExecuteYearTransition의 seating preserve-fields 리셋 결과와 동일한 형태
      seatingFake.seating = {
        rows: 2,
        cols: 3,
        seats: [
          [null, null, null],
          [null, null, null],
        ],
      };
      studentsRef.students = []; // 전환 직후 students도 빈 값

      await useSeatingStore.getState().load(true);

      const seating = useSeatingStore.getState().seating;
      expect(seating.rows).toBe(2);
      expect(seating.cols).toBe(3);
      expect(seating.seats.flat().every((cell) => cell === null)).toBe(true);
    });

    it('최소 유효형({rows:0,cols:0,seats:[]} — current 부재 케이스) load가 안전하다', async () => {
      seatingFake.seating = { rows: 0, cols: 0, seats: [] };
      studentsRef.students = [];

      await useSeatingStore.getState().load(true);

      const seating = useSeatingStore.getState().seating;
      expect(seating.seats).toEqual([]);
      expect(useSeatingStore.getState().loaded).toBe(true);
    });
  });
});

/**
 * useSeatingStore 의 프리셋(우연을 가장한 배치) 동작을 검증한다.
 *
 * - setPresetFromCurrent → 깊은 사본 저장
 * - clearPreset → 저장소에서 제거
 * - randomize() 가 프리셋 존재 시 셔플 대신 프리셋 적용 + 자동 소멸
 * - 프리셋 적용 시 sanitizeSeating 통과 (졸업 학생 좀비 차단)
 * - 적용 후 hasPreset === false (1회 사용)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { SeatingData } from '@domain/entities/Seating';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';
import type { Student } from '@domain/entities/Student';

const { seatingFake, constraintsFake, snapshotFake, studentsRef, settingsRef } = vi.hoisted(() => {
  const seatingFakeRef: {
    seating: SeatingData | null;
    preset: SeatingData | null;
  } & {
    getSeating(): Promise<SeatingData | null>;
    saveSeating(data: SeatingData): Promise<void>;
    getPreset(): Promise<SeatingData | null>;
    savePreset(data: SeatingData): Promise<void>;
    clearPreset(): Promise<void>;
  } = {
    seating: null,
    preset: null,
    async getSeating() {
      return this.seating;
    },
    async saveSeating(data) {
      this.seating = data;
    },
    async getPreset() {
      return this.preset;
    },
    async savePreset(data) {
      this.preset = data;
    },
    async clearPreset() {
      this.preset = null;
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
    async saveSnapshot(snap) {
      this.snapshots = [snap, ...this.snapshots].slice(0, 50);
    },
    async deleteSnapshot(id) {
      this.snapshots = this.snapshots.filter((s) => s.id !== id);
    },
    async clearAll() {
      this.snapshots = [];
    },
  };

  return {
    seatingFake: seatingFakeRef,
    constraintsFake: constraintsFakeRef,
    snapshotFake: snapshotFakeRef,
    studentsRef: { students: [] as Student[] },
    settingsRef: { update: vi.fn().mockResolvedValue(undefined) },
  };
});

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

import { useSeatingStore } from '../useSeatingStore';

function makeStudent(id: string, number: number, name: string): Student {
  return { id, studentNumber: number, name };
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

beforeEach(() => {
  seatingFake.seating = SEATING_3x1;
  seatingFake.preset = null;
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
    avoidHistoryStrength: 'off',
    presetArrangement: null,
    presetLoaded: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSeatingStore — 프리셋 (우연을 가장한 배치)', () => {
  describe('loadPreset', () => {
    it('저장소가 비어 있을 때 → presetArrangement=null, presetLoaded=true', async () => {
      await useSeatingStore.getState().loadPreset();
      expect(useSeatingStore.getState().presetArrangement).toBeNull();
      expect(useSeatingStore.getState().presetLoaded).toBe(true);
    });

    it('저장소에 프리셋이 있으면 state 에 로드된다', async () => {
      seatingFake.preset = {
        rows: 3,
        cols: 1,
        seats: [['s2'], ['s1'], ['s3']],
      };
      await useSeatingStore.getState().loadPreset();
      expect(useSeatingStore.getState().presetArrangement).not.toBeNull();
      expect(useSeatingStore.getState().presetArrangement?.seats[0]?.[0]).toBe('s2');
    });
  });

  describe('setPresetFromCurrent', () => {
    it('현재 배치를 깊은 사본으로 저장', async () => {
      await useSeatingStore.getState().setPresetFromCurrent();

      const preset = useSeatingStore.getState().presetArrangement;
      expect(preset).not.toBeNull();
      expect(preset?.seats).not.toBe(SEATING_3x1.seats);
      expect(preset?.seats[0]).not.toBe(SEATING_3x1.seats[0]);
      // 내용은 동일
      expect(preset?.seats[0]?.[0]).toBe('s1');
      expect(seatingFake.preset).not.toBeNull();
    });

    it('hasPreset() 이 true 반환', async () => {
      expect(useSeatingStore.getState().hasPreset()).toBe(false);
      await useSeatingStore.getState().setPresetFromCurrent();
      expect(useSeatingStore.getState().hasPreset()).toBe(true);
    });
  });

  describe('clearPreset', () => {
    it('프리셋을 저장소+state 양쪽에서 제거', async () => {
      await useSeatingStore.getState().setPresetFromCurrent();
      expect(useSeatingStore.getState().hasPreset()).toBe(true);

      await useSeatingStore.getState().clearPreset();
      expect(useSeatingStore.getState().presetArrangement).toBeNull();
      expect(seatingFake.preset).toBeNull();
    });
  });

  describe('randomize() — 프리셋 분기', () => {
    it('프리셋 활성 시 randomize() 가 프리셋을 적용', async () => {
      const PRESET: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s3'], ['s1'], ['s2']],
      };
      seatingFake.preset = PRESET;
      useSeatingStore.setState({
        presetArrangement: PRESET,
        presetLoaded: true,
      });

      const result = await useSeatingStore.getState().randomize();

      expect(result?.success).toBe(true);
      const current = useSeatingStore.getState().seating;
      expect(current.seats[0]?.[0]).toBe('s3');
      expect(current.seats[1]?.[0]).toBe('s1');
      expect(current.seats[2]?.[0]).toBe('s2');
    });

    it('프리셋 적용 후 1회 사용으로 자동 소멸 (hasPreset === false)', async () => {
      const PRESET: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s3'], ['s1'], ['s2']],
      };
      seatingFake.preset = PRESET;
      useSeatingStore.setState({
        presetArrangement: PRESET,
        presetLoaded: true,
      });

      await useSeatingStore.getState().randomize();

      expect(useSeatingStore.getState().hasPreset()).toBe(false);
      expect(seatingFake.preset).toBeNull();
    });

    it('프리셋 적용 시 sanitizeSeating 통과 — 졸업 학생 좀비 차단', async () => {
      // 프리셋에는 s3 가 있지만 명렬표에서 s3 졸업
      const PRESET: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s1'], ['s2'], ['s3']],
      };
      seatingFake.preset = PRESET;
      studentsRef.students = [makeStudent('s1', 1, '학생1'), makeStudent('s2', 2, '학생2')];
      useSeatingStore.setState({
        presetArrangement: PRESET,
        presetLoaded: true,
      });

      await useSeatingStore.getState().randomize();

      const flat = useSeatingStore.getState().seating.seats.flat();
      expect(flat).not.toContain('s3');
      expect(flat).toContain('s1');
      expect(flat).toContain('s2');
    });

    it('프리셋 적용 시에도 스냅샷이 source="shuffle" 로 기록됨 (외부 인식 일관)', async () => {
      seatingFake.preset = SEATING_3x1;
      useSeatingStore.setState({
        presetArrangement: SEATING_3x1,
        presetLoaded: true,
      });

      await useSeatingStore.getState().randomize();

      const list = useSeatingStore.getState().snapshots;
      expect(list).toHaveLength(1);
      expect(list[0]?.source).toBe('shuffle');
    });

    it('프리셋이 없으면 일반 셔플 경로로 진입 (기존 동작 보존)', async () => {
      // 프리셋 미설정 상태에서 randomize → 일반 셔플
      const result = await useSeatingStore.getState().randomize();
      expect(result?.success).toBe(true);
      // 스냅샷이 1개 만들어짐 (자동)
      expect(useSeatingStore.getState().snapshots).toHaveLength(1);
    });

    it('프리셋 적용 시 past 에 이전 상태가 push 되어 undo 가능', async () => {
      const PRESET: SeatingData = {
        rows: 3,
        cols: 1,
        seats: [['s2'], ['s3'], ['s1']],
      };
      seatingFake.preset = PRESET;
      useSeatingStore.setState({
        presetArrangement: PRESET,
        presetLoaded: true,
      });

      await useSeatingStore.getState().randomize();

      expect(useSeatingStore.getState().canUndo()).toBe(true);
    });
  });
});

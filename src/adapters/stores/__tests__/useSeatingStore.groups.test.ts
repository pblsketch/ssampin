/**
 * useSeatingStore 의 모둠(group) 관련 회귀 차단 테스트.
 *
 * cluster-fix 핫픽스 회귀 테스트:
 * - F2-2: sanitizeSeating 이 groups 의 stale studentIds 도 제거한다
 * - F2-3: changeLayout('group') 비연동 + 빈 groups → 격자 학생으로 자동 채움
 * - F2-4 보조: shuffleGroupSeating(4, 6) 으로 24명 → 4모둠 × 6명 (truncation 없음)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { SeatingData } from '@domain/entities/Seating';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';
import type { Student } from '@domain/entities/Student';

const { seatingFake, constraintsFake, snapshotFake, studentsRef, settingsRef } = vi.hoisted(() => {
  const seatingFakeRef: { seating: SeatingData | null } & {
    getSeating(): Promise<SeatingData | null>;
    saveSeating(data: SeatingData): Promise<void>;
    getPreset(): Promise<SeatingData | null>;
    savePreset(data: SeatingData): Promise<void>;
    clearPreset(): Promise<void>;
    preset: SeatingData | null;
  } = {
    seating: null,
    preset: null,
    async getSeating() {
      return this.seating;
    },
    async saveSeating(data: SeatingData) {
      this.seating = data;
    },
    async getPreset() {
      return this.preset;
    },
    async savePreset(data: SeatingData) {
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

function makeStudent(id: string, number: number, name = `학생${number}`): Student {
  return { id, studentNumber: number, name, status: 'active' };
}

/** 24명 명렬표 생성 */
function makeRoster24(): Student[] {
  return Array.from({ length: 24 }, (_, i) => makeStudent(`s${i + 1}`, i + 1));
}

/** 4행 × 6열 격자에 24명을 row-major 로 채운 SeatingData (비연동) */
function makeGridSeating24(): SeatingData {
  const seats: (string | null)[][] = [];
  let idx = 0;
  for (let r = 0; r < 4; r++) {
    const row: (string | null)[] = [];
    for (let c = 0; c < 6; c++) {
      row.push(`s${++idx}`);
    }
    seats.push(row);
  }
  return {
    rows: 4,
    cols: 6,
    seats,
    layout: 'grid',
    groupGridSync: false, // 비연동
  };
}

beforeEach(() => {
  seatingFake.seating = null;
  seatingFake.preset = null;
  snapshotFake.snapshots = [];
  studentsRef.students = makeRoster24();
  settingsRef.update.mockClear();

  useSeatingStore.setState({
    seating: { rows: 1, cols: 1, seats: [[null]] },
    past: [],
    future: [],
    loaded: false,
    isEditing: false,
    snapshots: [],
    snapshotsLoaded: false,
    presetArrangement: null,
    presetLoaded: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSeatingStore — 모둠 cluster-fix 회귀 차단', () => {
  describe('F2-3: 비연동 모드 격자 → 모둠 자동 채움', () => {
    it('비연동 + 빈 groups 상태에서 모둠 탭으로 전환하면 격자 학생이 모둠으로 자동 분배된다', async () => {
      seatingFake.seating = makeGridSeating24();
      await useSeatingStore.getState().load();

      // 비연동(=groupGridSync: false) + groups 없음
      expect(useSeatingStore.getState().seating.groupGridSync).toBe(false);
      expect(useSeatingStore.getState().seating.groups).toBeUndefined();

      await useSeatingStore.getState().changeLayout('group');

      const next = useSeatingStore.getState().seating;
      expect(next.layout).toBe('group');
      expect(next.groups).toBeDefined();
      // 24명 → 6명씩 4모둠
      expect(next.groups).toHaveLength(4);
      const totalAssigned = next.groups!.reduce((acc, g) => acc + g.studentIds.length, 0);
      expect(totalAssigned).toBe(24);
      // 학생 ID 누락 없음
      const ids = new Set(next.groups!.flatMap((g) => [...g.studentIds]));
      expect(ids.size).toBe(24);
    });

    it('비연동 + 이미 모둠이 존재하면 자동 채움하지 않고 보존한다', async () => {
      const seating: SeatingData = {
        ...makeGridSeating24(),
        layout: 'grid',
        groupGridSync: false,
        groups: [
          { id: 'g1', name: '예전모둠', color: '#abc', studentIds: ['s1', 's2'], maxSize: 6 },
        ],
      };
      seatingFake.seating = seating;
      await useSeatingStore.getState().load();

      await useSeatingStore.getState().changeLayout('group');

      const next = useSeatingStore.getState().seating;
      expect(next.layout).toBe('group');
      expect(next.groups).toHaveLength(1);
      expect(next.groups?.[0]?.name).toBe('예전모둠');
      expect(next.groups?.[0]?.studentIds).toEqual(['s1', 's2']);
    });
  });

  describe('F2-2: sanitizeSeating 이 groups 의 stale studentIds 도 제거', () => {
    it('명렬표에 없는 학생 ID 는 groups 에서 제거되고, 모둠 슬롯 구조는 보존된다', async () => {
      // stale ID "ghost1", "ghost2" 가 모둠에 포함된 SeatingData
      seatingFake.seating = {
        rows: 1,
        cols: 6,
        seats: [['s1', 's2', 's3', 's4', 's5', 's6']],
        layout: 'group',
        groups: [
          {
            id: 'g1',
            name: '1모둠',
            color: '#abc',
            studentIds: ['s1', 'ghost1', 's2'],
            maxSize: 6,
          },
          {
            id: 'g2',
            name: '2모둠',
            color: '#def',
            studentIds: ['ghost2', 's3'],
            maxSize: 6,
          },
        ],
      };
      // 현재 명렬표에는 s1~s6 만 있음 (ghost1/ghost2 졸업/전학으로 사라짐)
      studentsRef.students = [1, 2, 3, 4, 5, 6].map((n) => makeStudent(`s${n}`, n));

      await useSeatingStore.getState().load();

      const next = useSeatingStore.getState().seating;
      expect(next.groups).toHaveLength(2);
      expect(next.groups?.[0]?.studentIds).toEqual(['s1', 's2']);
      expect(next.groups?.[1]?.studentIds).toEqual(['s3']);
      // 모둠 메타데이터 보존
      expect(next.groups?.[0]?.name).toBe('1모둠');
      expect(next.groups?.[0]?.maxSize).toBe(6);
    });
  });

  describe('F2-4: shuffleGroupSeating 이 24명 → 4모둠 × 6명 truncation 없이 분배', () => {
    it('groupCount=4, maxSize=6 호출 시 24명 전원이 4개 모둠에 분배된다', async () => {
      seatingFake.seating = makeGridSeating24();
      await useSeatingStore.getState().load();

      await useSeatingStore.getState().shuffleGroupSeating(4, 6);

      const next = useSeatingStore.getState().seating;
      expect(next.layout).toBe('group');
      expect(next.groups).toHaveLength(4);
      const totalAssigned = next.groups!.reduce((acc, g) => acc + g.studentIds.length, 0);
      expect(totalAssigned).toBe(24);
      // 각 모둠 정확히 6명
      for (const g of next.groups!) {
        expect(g.studentIds).toHaveLength(6);
      }
    });
  });
});

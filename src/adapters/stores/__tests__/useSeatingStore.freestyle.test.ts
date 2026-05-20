/**
 * useSeatingStore 의 freestyle (자유 배치) Phase 1 통합 동작을 검증한다.
 *
 * Phase 1 회귀 차단 메타 테스트:
 * - grid 모드 SeatingData 로드/저장 시 freestyleDesks 자동 주입 없음 (마이그레이션 무해)
 * - freestyleDesks 가 있는 SeatingData 라운드트립 정확성
 * - 스냅샷 저장 후 원본 freestyleDesks 변경이 스냅샷에 영향 없음 (깊은 사본 P0-2)
 * - sanitizeSeating freestyle 분기: 졸업/전학생 좀비 ID 차단 (책상은 보존)
 * - grid 모드에서도 freestyleDesks 가 보존되면 sanitize 가 적용된다 (mode 토글 데이터 손실 0)
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import type { SeatingData, FreestyleDesk } from '@domain/entities/Seating';
import type { SeatingSnapshot } from '@domain/entities/SeatingSnapshot';
import type { Student } from '@domain/entities/Student';

// ── 메모리 fake repositories (vi.hoisted 로 mock factory 보다 먼저 평가) ──

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

// ── 헬퍼 ────────────────────────────────────────────────────────────────

function makeStudent(
  id: string,
  number: number,
  name: string,
  status: Student['status'] = 'active',
): Student {
  return { id, studentNumber: number, name, status };
}

const STUDENTS_3: readonly Student[] = [
  makeStudent('s1', 1, '학생1'),
  makeStudent('s2', 2, '학생2'),
  makeStudent('s3', 3, '학생3'),
];

/** 기존 grid 모드 SeatingData (freestyleDesks 없음) — 마이그레이션 회귀 테스트용 */
const GRID_SEATING: SeatingData = {
  rows: 3,
  cols: 1,
  seats: [['s1'], ['s2'], ['s3']],
};

/** freestyle 모드 SeatingData 팩토리 — 매번 깊은 사본 생성 (테스트 간 mutation 누수 차단) */
function makeFreestyleSeating(): SeatingData {
  return {
    rows: 3,
    cols: 1,
    seats: [[null], [null], [null]],
    layout: 'freestyle',
    freestyleDesks: [
      { id: 'd1', x: 100, y: 200, studentId: 's1' },
      { id: 'd2', x: 300, y: 400, studentId: 's2' },
      { id: 'd3', x: 500, y: 600, studentId: 's3' },
    ],
  };
}

beforeEach(() => {
  seatingFake.seating = null;
  seatingFake.preset = null;
  snapshotFake.snapshots = [];
  studentsRef.students = [...STUDENTS_3];
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

// ── 테스트 ──────────────────────────────────────────────────────────────

describe('useSeatingStore — freestyle Phase 1', () => {
  describe('하위 호환 (마이그레이션 회귀)', () => {
    it('grid 모드 SeatingData 로드 시 freestyleDesks 가 자동 주입되지 않는다', async () => {
      seatingFake.seating = GRID_SEATING;
      await useSeatingStore.getState().load();

      const loaded = useSeatingStore.getState().seating;
      expect(loaded.freestyleDesks).toBeUndefined();
      expect(loaded.layout).toBeUndefined();
      expect(loaded.seats).toEqual(GRID_SEATING.seats);
    });

    it('grid 모드 SeatingData 저장 시 freestyleDesks 가 자동 추가되지 않는다', async () => {
      seatingFake.seating = GRID_SEATING;
      await useSeatingStore.getState().load();
      // 강제로 좌석 변경 트리거 (swap 등을 통해 saveSeating 호출됨)
      // 여기서는 syncFromRoster 로 sanitize 만 거치는 케이스
      await useSeatingStore.getState().syncFromRoster(STUDENTS_3);

      const persisted = seatingFake.seating!;
      expect(persisted.freestyleDesks).toBeUndefined();
    });
  });

  describe('freestyle SeatingData 라운드트립', () => {
    it('freestyleDesks 가 있는 SeatingData 가 저장→로드 시 그대로 보존된다', async () => {
      seatingFake.seating = makeFreestyleSeating();
      await useSeatingStore.getState().load();

      const loaded = useSeatingStore.getState().seating;
      expect(loaded.layout).toBe('freestyle');
      expect(loaded.freestyleDesks).toHaveLength(3);
      expect(loaded.freestyleDesks?.[0]?.studentId).toBe('s1');
      expect(loaded.freestyleDesks?.[1]?.x).toBe(300);
    });
  });

  describe('스냅샷 깊은 사본 (P0-2 회귀 차단)', () => {
    it('saveCurrentAsSnapshot 후 원본 freestyleDesks 변경이 스냅샷에 영향 없다', async () => {
      seatingFake.seating = makeFreestyleSeating();
      await useSeatingStore.getState().load();
      await useSeatingStore.getState().saveCurrentAsSnapshot('테스트 스냅샷', 'manual');

      const snapshots = useSeatingStore.getState().snapshots;
      expect(snapshots).toHaveLength(1);
      const snapshotDesks = snapshots[0]!.seating.freestyleDesks;
      expect(snapshotDesks?.[0]?.x).toBe(100);

      // 원본 freestyleDesks 변경 시도 (TypeScript readonly 우회를 위해 캐스팅)
      const current = useSeatingStore.getState().seating;
      const mutableDesk = current.freestyleDesks![0] as { x: number };
      mutableDesk.x = 999;

      // 스냅샷은 원본 변경에 영향받지 않아야 한다 (깊은 사본 보장)
      const refetched = useSeatingStore.getState().snapshots[0]!.seating.freestyleDesks;
      expect(refetched?.[0]?.x).toBe(100);
    });
  });

  describe('sanitizeSeating freestyle 분기 (좀비 ID 차단)', () => {
    it('전학·졸업한 학생의 studentId 는 freestyleDesks 에서 null 로 정리되며 책상은 보존된다', async () => {
      seatingFake.seating = makeFreestyleSeating();
      // s2 가 졸업/전학 처리됨
      studentsRef.students = [
        makeStudent('s1', 1, '학생1'),
        makeStudent('s2', 2, '학생2', 'transferred'), // 비활성
        makeStudent('s3', 3, '학생3'),
      ];

      await useSeatingStore.getState().load();

      const after = useSeatingStore.getState().seating;
      expect(after.freestyleDesks).toHaveLength(3); // 책상은 모두 보존
      expect(after.freestyleDesks?.[0]?.studentId).toBe('s1');
      expect(after.freestyleDesks?.[1]?.studentId).toBeNull(); // 전학생 → null
      expect(after.freestyleDesks?.[2]?.studentId).toBe('s3');
      expect(after.freestyleDesks?.[1]?.id).toBe('d2'); // 책상 id 보존
    });

    it('grid 모드라도 freestyleDesks 가 보존되어 있으면 sanitize 가 적용된다 (mode 토글 데이터 보존 정책)', async () => {
      // grid 활성이지만 freestyleDesks 도 함께 보존된 케이스 (Design v0.2.1 §14)
      seatingFake.seating = {
        ...GRID_SEATING,
        layout: 'grid',
        freestyleDesks: [
          { id: 'd1', x: 100, y: 200, studentId: 's1' },
          { id: 'd2', x: 300, y: 400, studentId: 'graduated' },
        ],
      };
      studentsRef.students = [makeStudent('s1', 1, '학생1')];
      // s2, s3 이미 빠진 상태에서 graduated 도 비활성

      await useSeatingStore.getState().load();

      const after = useSeatingStore.getState().seating;
      expect(after.freestyleDesks?.[0]?.studentId).toBe('s1');
      expect(after.freestyleDesks?.[1]?.studentId).toBeNull(); // 비활성 학생 → null
      expect(after.layout).toBe('grid'); // 활성 layout 유지
    });
  });
});

// ── Phase 4: freestyle 액션 3종 ─────────────────────────────────────────

describe('useSeatingStore — freestyle Phase 4 actions', () => {
  it('applyFreestylePreset(rows) — 자동 좌표 생성 + layout/preset 갱신', async () => {
    seatingFake.seating = GRID_SEATING;
    await useSeatingStore.getState().load();

    await useSeatingStore.getState().applyFreestylePreset({
      type: 'rows',
      studentCount: 3,
      studentIds: ['s1', 's2', 's3'],
      columns: 5,
    });

    const after = useSeatingStore.getState().seating;
    expect(after.layout).toBe('freestyle');
    expect(after.freestylePreset).toBe('rows');
    expect(after.freestyleDesks).toHaveLength(3);
    expect(after.freestyleDesks?.[0]?.studentId).toBe('s1');
  });

  it('applyFreestylePreset(ushape) — 좌측·하단·우측 3면 분배', async () => {
    seatingFake.seating = GRID_SEATING;
    await useSeatingStore.getState().load();

    // 12명 정도면 좌측 3 + 하단 6 + 우측 3 분배 → 좌·우 회전 책상이 생성됨
    const ids = Array.from({ length: 12 }, (_, i) => `s${i + 1}`);
    await useSeatingStore.getState().applyFreestylePreset({
      type: 'ushape',
      studentCount: 12,
      studentIds: ids,
    });

    const desks = useSeatingStore.getState().seating.freestyleDesks!;
    expect(desks.length).toBe(12);
    // 적어도 한 책상은 회전(좌측 90° 또는 우측 270°)이 있어야 함
    expect(desks.some((d) => d.rotation === 90 || d.rotation === 270)).toBe(true);
  });

  it('moveFreestyleDesk — id 로 desk 를 찾아 x/y 만 업데이트', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    await useSeatingStore.getState().moveFreestyleDesk('d2', 450, 550);

    const after = useSeatingStore.getState().seating.freestyleDesks!;
    expect(after[1]?.id).toBe('d2');
    expect(after[1]?.x).toBe(450);
    expect(after[1]?.y).toBe(550);
    expect(after[1]?.studentId).toBe('s2'); // studentId 보존
    expect(after[0]?.x).toBe(100); // 다른 책상 영향 없음
  });

  it('moveFreestyleDesk — 0~1000 범위 밖 좌표는 clamp', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    await useSeatingStore.getState().moveFreestyleDesk('d1', -50, 1500);

    const desk = useSeatingStore.getState().seating.freestyleDesks![0]!;
    expect(desk.x).toBe(0); // clamp 하한
    expect(desk.y).toBe(1000); // clamp 상한
  });

  it('swapFreestyleStudents — 두 책상의 studentId 만 교환, 위치는 그대로', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    await useSeatingStore.getState().swapFreestyleStudents('d1', 'd3');

    const after = useSeatingStore.getState().seating.freestyleDesks!;
    expect(after[0]?.studentId).toBe('s3'); // d1 → s3
    expect(after[2]?.studentId).toBe('s1'); // d3 → s1
    // 위치는 그대로
    expect(after[0]?.x).toBe(100);
    expect(after[2]?.x).toBe(500);
  });

  it('moveMultipleFreestyleDesks — 여러 책상을 한 번에 이동, 비포함 책상은 그대로', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    await useSeatingStore.getState().moveMultipleFreestyleDesks([
      { id: 'd1', x: 200, y: 300 },
      { id: 'd3', x: 600, y: 700 },
    ]);

    const after = useSeatingStore.getState().seating.freestyleDesks!;
    expect(after[0]?.x).toBe(200);
    expect(after[0]?.y).toBe(300);
    expect(after[0]?.studentId).toBe('s1'); // studentId 보존
    // d2 는 그대로
    expect(after[1]?.x).toBe(300);
    expect(after[1]?.y).toBe(400);
    expect(after[2]?.x).toBe(600);
    expect(after[2]?.y).toBe(700);
  });

  it('moveMultipleFreestyleDesks — 범위 밖 좌표는 clamp, 빈 배열은 no-op', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();
    const before = useSeatingStore.getState().seating.freestyleDesks;

    await useSeatingStore.getState().moveMultipleFreestyleDesks([{ id: 'd1', x: -100, y: 2000 }]);

    const after = useSeatingStore.getState().seating.freestyleDesks!;
    expect(after[0]?.x).toBe(0);
    expect(after[0]?.y).toBe(1000);

    // 빈 배열 호출 시 변경 없음
    await useSeatingStore.getState().moveMultipleFreestyleDesks([]);
    const after2 = useSeatingStore.getState().seating.freestyleDesks!;
    expect(after2[0]?.x).toBe(0); // 직전 값 보존
    expect(before).toBeTruthy(); // before 변수 사용 (no-op 확인용 참조)
  });

  it('swapFreestyleStudents — 같은 책상 id 두 번 주면 no-op', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    const before = useSeatingStore.getState().seating.freestyleDesks;
    await useSeatingStore.getState().swapFreestyleStudents('d1', 'd1');
    const after = useSeatingStore.getState().seating.freestyleDesks;

    expect(after).toBe(before); // 동일 참조 (변경 없음)
  });

  /* ─── Phase 5a: 자유 모드 셔플 (randomize 분기) ─── */

  it('randomize() — freestyle 모드에서 책상 위치 보존 + 학생만 셔플', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    const before = useSeatingStore.getState().seating.freestyleDesks!;
    const beforePositions = before.map((d) => ({ id: d.id, x: d.x, y: d.y }));

    const result = await useSeatingStore.getState().randomize();

    expect(result?.success).toBe(true);
    const after = useSeatingStore.getState().seating.freestyleDesks!;
    // 책상 위치 보존
    for (let i = 0; i < after.length; i++) {
      expect(after[i]!.id).toBe(beforePositions[i]!.id);
      expect(after[i]!.x).toBe(beforePositions[i]!.x);
      expect(after[i]!.y).toBe(beforePositions[i]!.y);
    }
    // 학생 ID 집합 동일 (소실 0)
    const afterIds = new Set(after.map((d) => d.studentId));
    expect(afterIds).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('randomize() — freestyle 모드 셔플 후 자동 스냅샷 1건 생성 (source=shuffle)', async () => {
    seatingFake.seating = makeFreestyleSeating();
    await useSeatingStore.getState().load();

    expect(useSeatingStore.getState().snapshots).toHaveLength(0);
    await useSeatingStore.getState().randomize();

    const snaps = useSeatingStore.getState().snapshots;
    expect(snaps).toHaveLength(1);
    expect(snaps[0]!.source).toBe('shuffle');
    expect(snaps[0]!.seating.layout).toBe('freestyle');
    expect(snaps[0]!.seating.freestyleDesks).toHaveLength(3);
  });
});

// ── Type 호환성 확인 (컴파일 타임) ──────────────────────────────────────

describe('freestyle 타입 정의 (compile-time)', () => {
  it('FreestyleDesk 타입이 entities/Seating 에서 export 된다', () => {
    const desk: FreestyleDesk = {
      id: 'd1',
      x: 100,
      y: 200,
      studentId: null,
    };
    expect(desk.id).toBe('d1');
    expect(desk.studentId).toBeNull();
  });

  it("SeatingLayout 에 'freestyle' 이 포함된다", () => {
    const data: SeatingData = {
      rows: 1,
      cols: 1,
      seats: [[null]],
      layout: 'freestyle',
    };
    expect(data.layout).toBe('freestyle');
  });
});

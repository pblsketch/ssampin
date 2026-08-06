/**
 * 수업반 보관(P1 S1.2) — 스토어 액션·전파 가드·reorder 보존 가드.
 *
 * 계획: docs/01-plan/features/school-year-archive.plan.md §4 S1.2
 * 잠그는 결함:
 *  - 함정 ⑩: reorder가 배열을 통째 재구성해 보관된 반을 파일에서 유실
 *  - 함정 ㉒: 그룹 형제 무조건 덮어쓰기 — 보관된 반의 과거 명렬이 활성 반 편집으로 변조
 *  - 함정 ⑧: 일괄 보관을 N회 저장으로 쪼개면 .backup.json 1세대를 N번 덮음
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { TeachingClass } from '@domain/entities/TeachingClass';

/* ── 인메모리 repo fake ─────────────────────────────────────────────── */
const { teachingFake, shared } = vi.hoisted(() => {
  const shared = {
    classes: [] as TeachingClass[],
    saveClassesCalls: 0,
  };
  return {
    shared,
    teachingFake: {
      async getClasses() {
        // JSON 왕복 = 실제 파일 경계 재현
        return { classes: JSON.parse(JSON.stringify(shared.classes)) as TeachingClass[] };
      },
      async saveClasses(data: { classes: readonly TeachingClass[] }) {
        shared.saveClassesCalls += 1;
        shared.classes = JSON.parse(JSON.stringify(data.classes)) as TeachingClass[];
      },
      async getProgress() {
        return null;
      },
      async saveProgress() {},
      async getAttendance() {
        return null;
      },
      async saveAttendance() {},
    },
  };
});

vi.mock('@adapters/di/container', () => ({
  teachingClassRepository: teachingFake,
}));

import { useTeachingClassStore } from '../useTeachingClassStore';

function makeClass(overrides: Partial<TeachingClass> = {}): TeachingClass {
  return {
    id: 'tc-1',
    name: '3학년 1반',
    subject: '통합과학',
    students: [],
    order: 0,
    createdAt: '2026-03-02T00:00:00.000Z',
    updatedAt: '2026-03-02T00:00:00.000Z',
    ...overrides,
  };
}

async function seedAndLoad(classes: TeachingClass[]): Promise<void> {
  shared.classes = JSON.parse(JSON.stringify(classes)) as TeachingClass[];
  shared.saveClassesCalls = 0;
  useTeachingClassStore.setState({
    classes: [],
    progressEntries: [],
    attendanceRecords: [],
    selectedClassId: null,
    loaded: false,
    loadFailed: false,
  });
  await useTeachingClassStore.getState().load(true);
  shared.saveClassesCalls = 0; // load 중 마이그레이션 저장은 계수 제외
}

beforeEach(() => {
  shared.classes = [];
  shared.saveClassesCalls = 0;
});

describe('archiveClass — 개별 보관이 기본', () => {
  it('대상 반만 archived/archivedAt/archivedTerm이 세워지고 형제는 활성으로 남는다', async () => {
    await seedAndLoad([
      makeClass({ id: 'a', groupId: 'g1', subject: '통합과학', order: 0 }),
      makeClass({ id: 'b', groupId: 'g1', subject: '통합사회', order: 1 }),
    ]);

    await useTeachingClassStore.getState().archiveClass('a');

    const a = shared.classes.find((c) => c.id === 'a');
    const b = shared.classes.find((c) => c.id === 'b');
    expect(a?.archived).toBe(true);
    expect(a?.archivedAt).toBeTruthy();
    expect(a?.archivedTerm).toMatch(/^\d{4}-[12]$/);
    // 개별 보관 — 같은 그룹 형제는 건드리지 않는다 (v4 오너 결정 2)
    expect(b?.archived).toBeUndefined();
    expect(JSON.stringify(b)).toBe(
      JSON.stringify(makeClass({ id: 'b', groupId: 'g1', subject: '통합사회', order: 1 })),
    );
  });

  it('loadFailed 상태에서는 아무것도 하지 않는다 (빈 스냅샷 유실 방지)', async () => {
    await seedAndLoad([makeClass({ id: 'a' })]);
    useTeachingClassStore.setState({ loadFailed: true });

    await useTeachingClassStore.getState().archiveClass('a');

    expect(shared.classes.find((c) => c.id === 'a')?.archived).toBeUndefined();
    expect(shared.saveClassesCalls).toBe(0);
  });
});

describe('archiveClasses — 체크박스 일괄 보관', () => {
  it('여러 반을 저장 1회로 보관한다 (함정 ⑧ — N회 쓰기 금지)', async () => {
    await seedAndLoad([
      makeClass({ id: 'a', order: 0 }),
      makeClass({ id: 'b', order: 1 }),
      makeClass({ id: 'c', order: 2 }),
    ]);

    await useTeachingClassStore.getState().archiveClasses(['a', 'b']);

    expect(shared.saveClassesCalls).toBe(1);
    expect(shared.classes.find((c) => c.id === 'a')?.archived).toBe(true);
    expect(shared.classes.find((c) => c.id === 'b')?.archived).toBe(true);
    expect(shared.classes.find((c) => c.id === 'c')?.archived).toBeUndefined();
  });

  it('이미 보관된 반·없는 id는 건너뛰고, 전부 무효면 저장하지 않는다', async () => {
    const already = makeClass({ id: 'a', archived: true, archivedAt: 'x', archivedTerm: '2026-1' });
    await seedAndLoad([already]);

    await useTeachingClassStore.getState().archiveClasses(['a', 'ghost']);

    expect(shared.saveClassesCalls).toBe(0);
    expect(shared.classes.find((c) => c.id === 'a')?.archivedAt).toBe('x'); // 재보관으로 이력 덮지 않음
  });
});

describe('unarchiveClass — 복원', () => {
  it('활성 목록 맨 아래(order = max+1)로 복원하고 보관 이력은 남긴다', async () => {
    await seedAndLoad([
      makeClass({ id: 'a', order: 0 }),
      makeClass({ id: 'b', order: 4 }),
      makeClass({ id: 'z', order: 1, archived: true, archivedAt: 'T', archivedTerm: '2026-1' }),
    ]);

    await useTeachingClassStore.getState().unarchiveClass('z');

    const z = shared.classes.find((c) => c.id === 'z');
    expect(z?.archived).toBe(false);
    expect(z?.order).toBe(5); // max(0,4)+1
    expect(z?.archivedAt).toBe('T');
    expect(z?.archivedTerm).toBe('2026-1');
  });

  it('활성 반이 아니면 no-op', async () => {
    await seedAndLoad([makeClass({ id: 'a' })]);
    await useTeachingClassStore.getState().unarchiveClass('a'); // 보관 상태 아님
    expect(shared.saveClassesCalls).toBe(0);
  });
});

describe('reorderClasses — 보관된 반 보존 (함정 ⑩ 회귀 가드)', () => {
  it('활성 반만 재정렬해도 보관된 반이 파일에서 사라지지 않는다', async () => {
    await seedAndLoad([
      makeClass({ id: 'a', order: 0 }),
      makeClass({ id: 'b', order: 1 }),
      makeClass({ id: 'z', order: 2, archived: true, archivedAt: 'T', archivedTerm: '2026-1' }),
    ]);

    // UI는 활성 반 id만 넘긴다 (보관 섹션은 재정렬 대상 아님)
    await useTeachingClassStore.getState().reorderClasses(['b', 'a']);

    expect(shared.classes).toHaveLength(3); // 배열 길이가 줄지 않는다
    const z = shared.classes.find((c) => c.id === 'z');
    expect(JSON.stringify(z)).toBe(
      JSON.stringify(
        makeClass({ id: 'z', order: 2, archived: true, archivedAt: 'T', archivedTerm: '2026-1' }),
      ),
    ); // 보관된 반은 바이트 단위 무변경 (updatedAt도 안 민다)
    expect(shared.classes.find((c) => c.id === 'b')?.order).toBe(0);
    expect(shared.classes.find((c) => c.id === 'a')?.order).toBe(1);
  });
});

describe('그룹 격리 — 활성 형제 편집이 보관된 형제를 변조하지 않는다 (함정 ㉒)', () => {
  const seedGroup = () => [
    makeClass({
      id: 'active',
      groupId: 'g1',
      subject: '통합과학',
      order: 0,
      students: [{ number: 1, name: '김활성' }],
    }),
    makeClass({
      id: 'frozen',
      groupId: 'g1',
      subject: '통합사회',
      order: 1,
      archived: true,
      archivedAt: 'T',
      archivedTerm: '2026-1',
      students: [{ number: 1, name: '김과거' }],
      seating: { rows: 1, cols: 1, seats: [['1']] },
    }),
  ];

  it('syncGroupStudents가 보관된 형제의 명렬을 덮지 않는다', async () => {
    await seedAndLoad(seedGroup());
    const frozenBefore = JSON.stringify(shared.classes.find((c) => c.id === 'frozen'));

    await useTeachingClassStore.getState().syncGroupStudents('g1', [{ number: 2, name: '신입생' }]);

    expect(JSON.stringify(shared.classes.find((c) => c.id === 'frozen'))).toBe(frozenBefore);
    expect(shared.classes.find((c) => c.id === 'active')?.students[0]?.name).toBe('신입생');
  });

  it('syncGroupSeating이 보관된 형제의 좌석을 덮지 않는다', async () => {
    await seedAndLoad(seedGroup());
    const frozenBefore = JSON.stringify(shared.classes.find((c) => c.id === 'frozen'));

    await useTeachingClassStore.getState().syncGroupSeating('g1', {
      rows: 2,
      cols: 2,
      seats: [
        [null, null],
        [null, null],
      ],
    });

    expect(JSON.stringify(shared.classes.find((c) => c.id === 'frozen'))).toBe(frozenBefore);
    expect(shared.classes.find((c) => c.id === 'active')?.seating?.rows).toBe(2);
  });

  it('updateStudentStatus가 보관된 형제로 전파하지 않는다', async () => {
    await seedAndLoad(seedGroup());
    const frozenBefore = JSON.stringify(shared.classes.find((c) => c.id === 'frozen'));

    await useTeachingClassStore.getState().updateStudentStatus('active', '1', 'transferred');

    expect(JSON.stringify(shared.classes.find((c) => c.id === 'frozen'))).toBe(frozenBefore);
    expect(shared.classes.find((c) => c.id === 'active')?.students[0]?.status).toBe('transferred');
  });

  it('updateStudentStatus가 independent 형제로도 전파하지 않는다 (형제 정책 통일)', async () => {
    await seedAndLoad([
      makeClass({
        id: 'active',
        groupId: 'g1',
        order: 0,
        students: [{ number: 1, name: '김활성' }],
      }),
      makeClass({
        id: 'indep',
        groupId: 'g1',
        order: 1,
        studentSyncMode: 'independent',
        students: [{ number: 9, name: '독립명단' }],
      }),
    ]);
    const indepBefore = JSON.stringify(shared.classes.find((c) => c.id === 'indep'));

    await useTeachingClassStore.getState().updateStudentStatus('active', '1', 'withdrawn');

    expect(JSON.stringify(shared.classes.find((c) => c.id === 'indep'))).toBe(indepBefore);
  });
});

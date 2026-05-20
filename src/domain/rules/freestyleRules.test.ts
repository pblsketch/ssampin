import { describe, it, expect } from 'vitest';
import {
  sanitizeFreestyleDesks,
  euclideanDistance,
  cloneFreestyleDesks,
  generateFreestyleDesks,
  resolveGroupSizes,
  shuffleFreestyleStudents,
} from './freestyleRules';
import type { FreestyleDesk } from '@domain/entities/Seating';
import type { Student } from '@domain/entities/Student';

/** 결정론적 PRNG */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 테스트용 활성 학생 (status === 'active') */
function activeStudent(id: string, name = id): Student {
  return { id, name, status: 'active' };
}

/** 테스트용 비활성 학생 (졸업/전학 등) */
function inactiveStudent(id: string, name = id): Student {
  return { id, name, status: 'transferred' };
}

describe('sanitizeFreestyleDesks', () => {
  it('졸업·전학 학생의 studentId 는 null 로 변경되며 책상은 보존된다', () => {
    const desks: readonly FreestyleDesk[] = [
      { id: 'd1', x: 100, y: 200, studentId: 'active1' },
      { id: 'd2', x: 300, y: 400, studentId: 'transferred1' },
    ];
    const students: readonly Student[] = [
      activeStudent('active1'),
      inactiveStudent('transferred1'),
    ];

    const result = sanitizeFreestyleDesks(desks, students);

    expect(result.length).toBe(2); // 책상은 모두 보존
    expect(result[0]!.studentId).toBe('active1');
    expect(result[1]!.studentId).toBeNull(); // 전학생 → null
    expect(result[1]!.id).toBe('d2'); // 책상 id 보존
    expect(result[1]!.x).toBe(300);
  });

  it('변경할 것이 없으면 원본 참조를 그대로 반환한다 (React memo 최적화)', () => {
    const desks: readonly FreestyleDesk[] = [
      { id: 'd1', x: 100, y: 200, studentId: 'active1' },
      { id: 'd2', x: 300, y: 400, studentId: null },
    ];
    const students: readonly Student[] = [activeStudent('active1')];

    const result = sanitizeFreestyleDesks(desks, students);

    expect(result).toBe(desks); // 참조 동일
  });

  it('일부만 변경된 경우 변경된 desk 만 새 객체, 정상 desk 는 참조 동일성 유지 (selective re-render)', () => {
    const desks: readonly FreestyleDesk[] = [
      { id: 'd1', x: 100, y: 200, studentId: 'active1' },
      { id: 'd2', x: 300, y: 400, studentId: 'transferred1' },
      { id: 'd3', x: 500, y: 600, studentId: 'active2' },
    ];
    const students: readonly Student[] = [
      activeStudent('active1'),
      inactiveStudent('transferred1'),
      activeStudent('active2'),
    ];

    const result = sanitizeFreestyleDesks(desks, students);

    expect(result).not.toBe(desks); // 배열 자체는 새 참조 (1개라도 변경됨)
    expect(result[0]).toBe(desks[0]); // 정상 desk 는 참조 동일
    expect(result[1]).not.toBe(desks[1]); // 변경된 desk 만 새 객체
    expect(result[2]).toBe(desks[2]); // 정상 desk 는 참조 동일
    expect(result[1]!.studentId).toBeNull();
  });

  it('studentId 가 null 인 desk 는 학생 활성 여부와 무관하게 변경 없음', () => {
    const desks: readonly FreestyleDesk[] = [{ id: 'd1', x: 100, y: 200, studentId: null }];
    const students: readonly Student[] = [];

    const result = sanitizeFreestyleDesks(desks, students);

    expect(result).toBe(desks); // null 은 sanitize 대상 아님
  });
});

describe('euclideanDistance', () => {
  it('(0, 0) 과 (3, 4) 의 거리는 5 (3-4-5 직각삼각형)', () => {
    const a: FreestyleDesk = { id: 'a', x: 0, y: 0, studentId: null };
    const b: FreestyleDesk = { id: 'b', x: 3, y: 4, studentId: null };

    expect(euclideanDistance(a, b)).toBe(5);
  });

  it('같은 위치 desk 의 거리는 0', () => {
    const a: FreestyleDesk = { id: 'a', x: 500, y: 500, studentId: null };
    const b: FreestyleDesk = { id: 'b', x: 500, y: 500, studentId: 'x' };

    expect(euclideanDistance(a, b)).toBe(0);
  });

  it('대각선 최대 거리는 정규화 범위 0~1000 에서 약 1414', () => {
    const a: FreestyleDesk = { id: 'a', x: 0, y: 0, studentId: null };
    const b: FreestyleDesk = { id: 'b', x: 1000, y: 1000, studentId: null };

    expect(euclideanDistance(a, b)).toBeCloseTo(1414.21, 1);
  });
});

describe('cloneFreestyleDesks', () => {
  it('undefined 입력은 undefined 를 반환', () => {
    expect(cloneFreestyleDesks(undefined)).toBeUndefined();
  });

  it('빈 배열 입력은 새 빈 배열을 반환 (참조 분리)', () => {
    const original: readonly FreestyleDesk[] = [];
    const cloned = cloneFreestyleDesks(original);
    expect(cloned).toEqual([]);
    expect(cloned).not.toBe(original); // 새 배열
  });

  it('원본 desk 의 필드 변경이 사본에 영향 없음 (깊은 사본 보장)', () => {
    const original: FreestyleDesk[] = [{ id: 'd1', x: 100, y: 200, studentId: 's1', rotation: 45 }];
    const cloned = cloneFreestyleDesks(original)!;

    // 원본 변경 (TypeScript readonly 우회를 위해 any 캐스팅 — 테스트 전용)
    (original[0] as { x: number }).x = 999;

    expect(cloned[0]!.x).toBe(100); // 사본은 불변
    expect(cloned[0]!.rotation).toBe(45);
    expect(cloned[0]).not.toBe(original[0]); // desk 객체도 새 참조
  });
});

/* ════════════════════════════════════════════════════════════
 * Phase 2 — 프리셋 좌표 생성 알고리즘
 * ════════════════════════════════════════════════════════════ */

describe('resolveGroupSizes', () => {
  it('학생 수가 0이면 빈 배열', () => {
    expect(resolveGroupSizes(0, 4)).toEqual([]);
  });

  it('20명 / 4인 1조 → 5개 모둠 모두 4명', () => {
    expect(resolveGroupSizes(20, 4)).toEqual([4, 4, 4, 4, 4]);
  });

  it('25명 / 4인 1조 → 7개 모둠, 잔여 분배 (3+4+4+4+...)', () => {
    const sizes = resolveGroupSizes(25, 4);
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(25);
    expect(sizes.length).toBeGreaterThan(0);
  });

  it('사용자 직접 지정 합계가 일치하면 그대로 사용', () => {
    expect(resolveGroupSizes(25, 4, [4, 4, 4, 4, 4, 5])).toEqual([4, 4, 4, 4, 4, 5]);
  });

  it('사용자 직접 지정 합계가 불일치하면 무시하고 자동 분배', () => {
    const sizes = resolveGroupSizes(25, 4, [3, 3, 3]); // 합 9 ≠ 25
    const total = sizes.reduce((a, b) => a + b, 0);
    expect(total).toBe(25);
  });
});

describe('generateFreestyleDesks — rows (일제식)', () => {
  it('25명 / 5열 → 5x5 격자, 모든 책상의 x/y 가 0~1000 범위', () => {
    const desks = generateFreestyleDesks({
      type: 'rows',
      studentCount: 25,
      columns: 5,
    });
    expect(desks.length).toBe(25);
    for (const d of desks) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.x).toBeLessThanOrEqual(1000);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeLessThanOrEqual(1000);
    }
  });

  it('28명 / 6열 → 5행, 마지막 줄 4명 가운데 정렬 (x 좌표가 대칭)', () => {
    const desks = generateFreestyleDesks({
      type: 'rows',
      studentCount: 28,
      columns: 6,
    });
    expect(desks.length).toBe(28);
    // 마지막 줄 4명의 x 좌표가 첫 4명의 x 좌표와 대칭이어야 함
    const lastRowDesks = desks.slice(24); // 4명
    const xs = lastRowDesks.map((d) => d.x).sort((a, b) => a - b);
    // 좌우 대칭 확인: (x[0] + x[3]) ≈ (x[1] + x[2])
    const sumOuter = xs[0]! + xs[3]!;
    const sumInner = xs[1]! + xs[2]!;
    expect(Math.abs(sumOuter - sumInner)).toBeLessThan(1); // 부동소수점 오차
  });

  it('columns 범위 외 입력은 4~7로 clamp', () => {
    const desks = generateFreestyleDesks({
      type: 'rows',
      studentCount: 20,
      columns: 99, // 7로 clamp
    });
    // 행 수 = ceil(20/7) = 3
    expect(desks.length).toBe(20);
  });

  it('studentIds 가 제공되면 책상에 순서대로 배정', () => {
    const desks = generateFreestyleDesks({
      type: 'rows',
      studentCount: 5,
      columns: 5,
      studentIds: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(desks.map((d) => d.studentId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('studentIds 가 부족하면 남은 책상은 studentId: null', () => {
    const desks = generateFreestyleDesks({
      type: 'rows',
      studentCount: 5,
      columns: 5,
      studentIds: ['a', 'b'],
    });
    expect(desks[0]!.studentId).toBe('a');
    expect(desks[1]!.studentId).toBe('b');
    expect(desks[2]!.studentId).toBeNull();
    expect(desks[3]!.studentId).toBeNull();
    expect(desks[4]!.studentId).toBeNull();
  });
});

describe('generateFreestyleDesks — clusters (모둠형)', () => {
  it('20명 / 4인 1조 → 5개 모둠, 총 20 책상, 모든 책상에 groupId', () => {
    const desks = generateFreestyleDesks({
      type: 'clusters',
      studentCount: 20,
      groupSize: 4,
    });
    expect(desks.length).toBe(20);
    const groupIds = new Set(desks.map((d) => d.groupId));
    expect(groupIds.size).toBe(5); // 5개 모둠
    for (const d of desks) {
      expect(d.groupId).toBeDefined();
    }
  });

  it('같은 모둠의 책상들은 좌표가 인접 (cardWidth 이내)', () => {
    const desks = generateFreestyleDesks({
      type: 'clusters',
      studentCount: 16,
      groupSize: 4,
    });
    // 첫 4명 = 같은 모둠
    const group1 = desks.slice(0, 4);
    const sameGroupId = group1.every((d) => d.groupId === group1[0]!.groupId);
    expect(sameGroupId).toBe(true);
    // 같은 모둠 내부 책상 거리는 다른 모둠 책상보다 가까워야 함
    const intraDist = euclideanDistance(group1[0]!, group1[3]!);
    const interDist = euclideanDistance(group1[0]!, desks[4]!);
    expect(intraDist).toBeLessThan(interDist);
  });

  it('사용자 직접 지정 모둠 인원 (4,4,4,3,5,5)', () => {
    const desks = generateFreestyleDesks({
      type: 'clusters',
      studentCount: 25,
      groupSize: 4,
      groupSizes: [4, 4, 4, 3, 5, 5],
    });
    expect(desks.length).toBe(25);
    // 4번째 모둠은 3명
    const fourthGroupId = desks[12]!.groupId;
    const fourthGroupDesks = desks.filter((d) => d.groupId === fourthGroupId);
    expect(fourthGroupDesks.length).toBe(3);
  });
});

describe('generateFreestyleDesks — ushape (ㄷ자형)', () => {
  it('24명 → 3면 분배 (좌측 6, 하단 12, 우측 6)', () => {
    const desks = generateFreestyleDesks({
      type: 'ushape',
      studentCount: 24,
    });
    expect(desks.length).toBe(24);
    // 좌측 6 + 하단 12 + 우측 6
    const leftDesks = desks.filter((d) => d.rotation === 90);
    const bottomDesks = desks.filter((d) => d.rotation === 0);
    const rightDesks = desks.filter((d) => d.rotation === 270);
    expect(leftDesks.length).toBe(6);
    expect(bottomDesks.length).toBe(12);
    expect(rightDesks.length).toBe(6);
  });

  it('각 면의 책상은 같은 축 좌표를 공유한다', () => {
    const desks = generateFreestyleDesks({
      type: 'ushape',
      studentCount: 16,
    });
    const leftDesks = desks.filter((d) => d.rotation === 90);
    const bottomDesks = desks.filter((d) => d.rotation === 0);
    const rightDesks = desks.filter((d) => d.rotation === 270);

    // 좌측 면: x 좌표가 모두 같음
    const leftXs = new Set(leftDesks.map((d) => d.x));
    expect(leftXs.size).toBe(1);

    // 우측 면: x 좌표가 모두 같음
    const rightXs = new Set(rightDesks.map((d) => d.x));
    expect(rightXs.size).toBe(1);

    // 하단 면: y 좌표가 모두 같음
    const bottomYs = new Set(bottomDesks.map((d) => d.y));
    expect(bottomYs.size).toBe(1);
  });

  it('17명 (홀수)도 분배 가능 (좌측 4 + 하단 9 + 우측 4)', () => {
    const desks = generateFreestyleDesks({
      type: 'ushape',
      studentCount: 17,
    });
    expect(desks.length).toBe(17);
  });
});

describe('generateFreestyleDesks — exam (시험 대형, column-major)', () => {
  it('column-major: 1번이 1열 1행, 2번이 1열 2행, ... 한 열이 차면 다음 열로', () => {
    // 6명 / 3열 → 2행, 각 열 2명씩
    const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 6,
      columns: 3,
      studentIds: ids,
      numberDirection: 'left-to-right',
    });

    expect(desks.length).toBe(6);
    // x 오름차순(열) + y 오름차순(행) 정렬 — 1열 위, 1열 아래, 2열 위, 2열 아래, ...
    const sortedByColRow = [...desks].sort((a, b) => a.x - b.x || a.y - b.y);
    expect(sortedByColRow[0]!.studentId).toBe('s1'); // 1열 1행
    expect(sortedByColRow[1]!.studentId).toBe('s2'); // 1열 2행
    expect(sortedByColRow[2]!.studentId).toBe('s3'); // 2열 1행
    expect(sortedByColRow[3]!.studentId).toBe('s4'); // 2열 2행
    expect(sortedByColRow[4]!.studentId).toBe('s5'); // 3열 1행
    expect(sortedByColRow[5]!.studentId).toBe('s6'); // 3열 2행
  });

  it('left-to-right: 1번이 가장 좌측 열에 배치', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5'];
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 5,
      columns: 5,
      studentIds: ids,
      numberDirection: 'left-to-right',
    });
    // 가장 작은 x (좌측 첫 열) 책상이 s1
    const sortedByX = [...desks].sort((a, b) => a.x - b.x);
    expect(sortedByX[0]!.studentId).toBe('s1');
  });

  it('right-to-left: 1번이 가장 우측 열에 배치', () => {
    const ids = ['s1', 's2', 's3', 's4', 's5'];
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 5,
      columns: 5,
      studentIds: ids,
      numberDirection: 'right-to-left',
    });
    // 가장 큰 x (우측 첫 열) 책상이 s1
    const sortedByX = [...desks].sort((a, b) => a.x - b.x);
    expect(sortedByX[sortedByX.length - 1]!.studentId).toBe('s1');
  });

  it('학생 수가 열수로 나누어 떨어지지 않으면 마지막 열에 잔여 학생만', () => {
    // 13명 / 5열 → 3행. col 0~3 각 3명 (총 12) + col 4 1명
    const ids = Array.from({ length: 13 }, (_, i) => `s${i + 1}`);
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 13,
      columns: 5,
      studentIds: ids,
      numberDirection: 'left-to-right',
    });
    expect(desks.length).toBe(13);

    const xs = [...new Set(desks.map((d) => d.x))].sort((a, b) => a - b);
    expect(xs.length).toBe(5); // 5개 열
    const lastColDesks = desks.filter((d) => d.x === xs[xs.length - 1]);
    expect(lastColDesks.length).toBe(1);
    expect(lastColDesks[0]!.studentId).toBe('s13'); // 마지막 학생
  });

  it('기본 numberDirection 은 left-to-right', () => {
    const ids = ['s1', 's2'];
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 2,
      columns: 2,
      studentIds: ids,
    });
    const sortedByX = [...desks].sort((a, b) => a.x - b.x);
    expect(sortedByX[0]!.studentId).toBe('s1');
  });

  it('studentIds 가 부족하면 남은 책상은 studentId null', () => {
    const desks = generateFreestyleDesks({
      type: 'exam',
      studentCount: 5,
      columns: 5,
      studentIds: ['s1', 's2'],
    });
    expect(desks.length).toBe(5);
    const placed = desks.filter((d) => d.studentId !== null).length;
    expect(placed).toBe(2);
  });
});

describe('shuffleFreestyleStudents (Phase 5a)', () => {
  const seedDesks: readonly FreestyleDesk[] = [
    { id: 'd1', x: 100, y: 100, studentId: 's1' },
    { id: 'd2', x: 200, y: 100, studentId: 's2' },
    { id: 'd3', x: 300, y: 100, studentId: 's3' },
    { id: 'd4', x: 400, y: 100, studentId: 's4' },
  ];

  it('책상 위치(x, y, id)는 그대로, studentId 만 셔플된다', () => {
    const result = shuffleFreestyleStudents(seedDesks, mulberry32(42));
    // 책상 id 와 좌표는 인덱스별로 동일
    for (let i = 0; i < seedDesks.length; i++) {
      expect(result[i]!.id).toBe(seedDesks[i]!.id);
      expect(result[i]!.x).toBe(seedDesks[i]!.x);
      expect(result[i]!.y).toBe(seedDesks[i]!.y);
    }
    // 학생 ID 집합은 동일 (소실 0)
    const studentIds = new Set(result.map((d) => d.studentId));
    expect(studentIds).toEqual(new Set(['s1', 's2', 's3', 's4']));
  });

  it('빈 책상(studentId: null)은 셔플 후에도 null 유지 (의도적 빈자리 보존)', () => {
    const withEmpty: readonly FreestyleDesk[] = [
      { id: 'd1', x: 100, y: 100, studentId: 's1' },
      { id: 'd2', x: 200, y: 100, studentId: null },
      { id: 'd3', x: 300, y: 100, studentId: 's2' },
      { id: 'd4', x: 400, y: 100, studentId: null },
    ];
    const result = shuffleFreestyleStudents(withEmpty, mulberry32(7));
    expect(result[1]!.studentId).toBeNull();
    expect(result[3]!.studentId).toBeNull();
    // 학생들은 d1, d3 에만 분배됨
    const placed = [result[0]!.studentId, result[2]!.studentId].sort();
    expect(placed).toEqual(['s1', 's2']);
  });

  it('결정론적 PRNG → 동일 seed 에서 동일 결과 (테스트 안정성 보장)', () => {
    const r1 = shuffleFreestyleStudents(seedDesks, mulberry32(100));
    const r2 = shuffleFreestyleStudents(seedDesks, mulberry32(100));
    expect(r1.map((d) => d.studentId)).toEqual(r2.map((d) => d.studentId));
  });

  it('빈 배열 입력은 빈 배열 반환', () => {
    expect(shuffleFreestyleStudents([])).toEqual([]);
  });
});

describe('generateFreestyleDesks — Tier 2/3 (미구현)', () => {
  it('pairs/facing_rows/circle/double_horseshoe/hybrid_zones/chevron 은 빈 배열 반환 (exam 은 Tier 1 승격)', () => {
    const tier23: Array<
      'pairs' | 'facing_rows' | 'circle' | 'double_horseshoe' | 'hybrid_zones' | 'chevron'
    > = ['pairs', 'facing_rows', 'circle', 'double_horseshoe', 'hybrid_zones', 'chevron'];
    for (const type of tier23) {
      const desks = generateFreestyleDesks({ type, studentCount: 20 });
      expect(desks).toEqual([]);
    }
  });
});

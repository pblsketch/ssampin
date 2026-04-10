import type { SeatingData, SeatGroup } from '../entities/Seating';
import { GROUP_COLORS } from '../entities/Seating';
import type { Student } from '../entities/Student';
import type {
  ZoneId,
  SeatConstraints,
  FixedSeatConstraint,
  ZoneConstraint,
} from '../entities/SeatConstraints';
import type { OddColumnMode } from './seatingLayoutRules';
import {
  buildPairGroups,
} from './seatingLayoutRules';
export type { OddColumnMode, PairGroup } from './seatingLayoutRules';
export { buildPairGroups } from './seatingLayoutRules';

/**
 * 좌석 위치가 유효한지 검증
 */
export function validateSeatPosition(
  seating: SeatingData,
  row: number,
  col: number,
): boolean {
  return row >= 0 && row < seating.rows && col >= 0 && col < seating.cols;
}

/**
 * 두 좌석의 학생 ID를 교환한 새 seats 배열 반환 (순수 함수)
 */
export function swapSeatIds(
  seats: readonly (readonly (string | null)[])[],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): (string | null)[][] {
  const copy = seats.map((row) => [...row]);
  const temp = copy[r1]![c1]!;
  copy[r1]![c1] = copy[r2]![c2]!;
  copy[r2]![c2] = temp;
  return copy;
}

/**
 * Fisher-Yates 셔플 (내부 헬퍼)
 */
function fisherYatesShuffle<T>(
  arr: T[],
  random: () => number,
): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = a[i]!;
    a[i] = a[j]!;
    a[j] = temp;
  }
  return a;
}

/**
 * 짝꿍 그룹 구조를 유지한 채 학생만 셔플.
 * 그룹 내 학생 + 그룹 위치를 모두 랜덤화하되
 * 각 그룹의 크기(2명/3명/1명)는 보존.
 */
export function shuffleSeatsPreservingGroups(
  seats: readonly (readonly (string | null)[])[],
  cols: number,
  oddColumnMode: OddColumnMode,
  random: () => number = Math.random,
): (string | null)[][] {
  const rows = seats.length;

  // 1. 짝꿍 그룹 정의
  const groups = buildPairGroups(cols, oddColumnMode);

  // 2. 모든 학생 ID 추출 (빈 자리 제외)
  const allStudentIds = seats.flat().filter((id): id is string => id !== null);

  // 3. Fisher-Yates로 학생 셔플
  const shuffled = fisherYatesShuffle(allStudentIds, random);

  // 4. 새 그리드 생성 — 그룹 구조에 맞게 학생 배치
  const grid: (string | null)[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );

  let studentIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (const group of groups) {
      for (let c = group.startCol; c <= group.endCol; c++) {
        if (studentIdx < shuffled.length) {
          grid[r]![c] = shuffled[studentIdx]!;
          studentIdx++;
        }
      }
    }
  }

  return grid;
}

/**
 * Fisher-Yates 셔플로 학생 랜덤 재배치 (순수 함수)
 * seedRandom을 주입하면 테스트 가능, 기본값은 Math.random
 */
export function shuffleSeats(
  seats: readonly (readonly (string | null)[])[],
  random: () => number = Math.random,
): (string | null)[][] {
  // 2D → 1D 평탄화
  const flat: (string | null)[] = seats.flatMap((row) => [...row]);

  // 학생 ID만 추출 (빈 자리 제외)
  const studentIds = flat.filter((id): id is string => id !== null);
  const emptyCount = flat.length - studentIds.length;

  // Fisher-Yates: 학생만 셔플
  for (let i = studentIds.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const temp = studentIds[i]!;
    studentIds[i] = studentIds[j]!;
    studentIds[j] = temp;
  }

  // 학생을 앞에, 빈 자리(null)를 뒤에 배치
  const arranged: (string | null)[] = [
    ...studentIds,
    ...Array.from<null>({ length: emptyCount }).fill(null),
  ];

  // 1D → 2D 복원
  const cols = seats[0]?.length ?? 0;
  const result: (string | null)[][] = [];
  for (let i = 0; i < arranged.length; i += cols) {
    result.push(arranged.slice(i, i + cols));
  }
  return result;
}

/**
 * 좌석 배열에서 학생 수 (null이 아닌 칸) 세기
 */
export function countStudents(
  seats: readonly (readonly (string | null)[])[],
): number {
  return seats.flat().filter((id) => id !== null).length;
}

/**
 * 빈 자리 수 세기
 */
export function countEmptySeats(
  seats: readonly (readonly (string | null)[])[],
): number {
  return seats.flat().filter((id) => id === null).length;
}

/**
 * 모든 좌석을 null로 초기화한 새 seats 배열 반환 (순수 함수)
 * 행/열 차원은 유지, 학생 배정만 제거
 */
export function clearAllSeats(
  rows: number,
  cols: number,
): (string | null)[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
}

/**
 * 학생 이름으로 Student 목록에서 ID 맵 생성
 */
export function buildStudentMap(
  students: readonly Student[],
): ReadonlyMap<string, Student> {
  return new Map(students.map((s) => [s.id, s]));
}

/* ──────────────────────── 좌석 배치 조건 함수 ──────────────────────── */

export interface ShuffleResult {
  readonly seats: (string | null)[][];
  readonly success: boolean;
  readonly attempts: number;
  readonly relaxed: boolean;
  readonly violations: string[];
}

/**
 * 영역(ZoneId)에 해당하는 좌석 좌표 목록 반환
 */
export function getZonePositions(
  zone: ZoneId,
  rows: number,
  cols: number,
): { row: number; col: number }[] {
  const positions: { row: number; col: number }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let match = false;
      switch (zone) {
        case 'front1': match = r === 0; break;
        case 'front2': match = r <= 1; break;
        case 'front3': match = r <= 2; break;
        case 'back1': match = r === rows - 1; break;
        case 'back2': match = r >= rows - 2; break;
        case 'left1': match = c === 0; break;
        case 'right1': match = c === cols - 1; break;
        case 'center': {
          const notEdgeRow = r > 0 && r < rows - 1;
          const notEdgeCol = c > 0 && c < cols - 1;
          // 3x3 미만 그리드에서는 전체가 center
          if (rows <= 2 || cols <= 2) {
            match = true;
          } else {
            match = notEdgeRow && notEdgeCol;
          }
          break;
        }
      }
      if (match) {
        positions.push({ row: r, col: c });
      }
    }
  }
  return positions;
}

/**
 * 맨해튼 거리
 */
export function manhattanDistance(
  r1: number,
  c1: number,
  r2: number,
  c2: number,
): number {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2);
}

/**
 * 2D 좌석 배열에서 특정 학생의 좌표 찾기
 */
function findStudentPosition(
  seats: readonly (readonly (string | null)[])[],
  studentId: string,
): { row: number; col: number } | null {
  for (let r = 0; r < seats.length; r++) {
    const row = seats[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      if (row[c] === studentId) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * 현재 좌석 배치가 조건을 만족하는지 검증
 */
export function validateConstraints(
  seats: readonly (readonly (string | null)[])[],
  constraints: SeatConstraints,
  rows: number,
  cols: number,
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // 고정 좌석 검증
  for (const fc of constraints.fixedSeats) {
    const pos = findStudentPosition(seats, fc.studentId);
    if (pos && (pos.row !== fc.row || pos.col !== fc.col)) {
      violations.push(`고정좌석 위반: ${fc.studentId}`);
    }
  }

  // 영역 검증
  for (const zc of constraints.zones) {
    const pos = findStudentPosition(seats, zc.studentId);
    if (!pos) continue;
    const zonePos = getZonePositions(zc.zone, rows, cols);
    const inZone = zonePos.some((p) => p.row === pos.row && p.col === pos.col);
    if (!inZone) {
      violations.push(`영역 위반: ${zc.studentId}`);
    }
  }

  // 분리 조건 검증
  for (const sep of constraints.separations) {
    const posA = findStudentPosition(seats, sep.studentA);
    const posB = findStudentPosition(seats, sep.studentB);
    if (posA && posB) {
      const dist = manhattanDistance(posA.row, posA.col, posB.row, posB.col);
      if (dist < sep.minDistance) {
        violations.push(`분리 위반: ${sep.studentA}-${sep.studentB} (거리 ${dist} < ${sep.minDistance})`);
      }
    }
  }

  // 인접 조건 검증
  for (const adj of constraints.adjacencies) {
    const posA = findStudentPosition(seats, adj.studentA);
    const posB = findStudentPosition(seats, adj.studentB);
    if (posA && posB) {
      const dist = manhattanDistance(posA.row, posA.col, posB.row, posB.col);
      if (dist > adj.maxDistance) {
        violations.push(`인접 위반: ${adj.studentA}-${adj.studentB} (거리 ${dist} > ${adj.maxDistance})`);
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * 조건 반영 좌석 셔플
 * 1. 고정좌석 배치 → 셔플 제외
 * 2. 영역고정 학생 → 해당 영역 내 빈 자리에 랜덤 배치
 * 3. 나머지 학생 → 남은 빈 자리에 Fisher-Yates
 * 4. 분리/인접 검증 → 불만족 시 재시도 (최대 200회)
 * 5. 200회 실패 → 분리 거리 완화 후 재시도
 * 6. 최종 실패 → success=false + 최선의 배치 반환
 */
export function shuffleSeatsWithConstraints(
  seats: readonly (readonly (string | null)[])[],
  constraints: SeatConstraints,
  rows: number,
  cols: number,
  random: () => number = Math.random,
  options?: { pairMode?: boolean; oddColumnMode?: OddColumnMode },
): ShuffleResult {
  // 조건이 없으면 기존 셔플과 동일
  if (
    constraints.fixedSeats.length === 0 &&
    constraints.zones.length === 0 &&
    constraints.separations.length === 0 &&
    constraints.adjacencies.length === 0
  ) {
    if (options?.pairMode) {
      return {
        seats: shuffleSeatsPreservingGroups(seats, cols, options.oddColumnMode ?? 'single', random),
        success: true,
        attempts: 1,
        relaxed: false,
        violations: [],
      };
    }
    return {
      seats: shuffleSeats(seats, random),
      success: true,
      attempts: 1,
      relaxed: false,
      violations: [],
    };
  }

  // 학생 ID 추출
  const allStudentIds = seats.flat().filter((id): id is string => id !== null);

  // 고정 좌석 학생 세트
  const fixedMap = new Map<string, FixedSeatConstraint>();
  for (const fc of constraints.fixedSeats) {
    if (allStudentIds.includes(fc.studentId)) {
      fixedMap.set(fc.studentId, fc);
    }
  }

  // 영역 고정 학생 (고정좌석이 아닌)
  const zoneStudents: ZoneConstraint[] = constraints.zones.filter(
    (zc) => allStudentIds.includes(zc.studentId) && !fixedMap.has(zc.studentId),
  );

  // 나머지 학생 (고정도 영역도 아닌)
  const fixedIds = new Set(fixedMap.keys());
  const zoneIds = new Set(zoneStudents.map((z) => z.studentId));
  const freeStudents = allStudentIds.filter(
    (id) => !fixedIds.has(id) && !zoneIds.has(id),
  );

  // 분리/인접 조건 (활성 학생만 필터)
  const activeIds = new Set(allStudentIds);
  const separations = constraints.separations.filter(
    (s) => activeIds.has(s.studentA) && activeIds.has(s.studentB),
  );
  const adjacencies = constraints.adjacencies.filter(
    (a) => activeIds.has(a.studentA) && activeIds.has(a.studentB),
  );

  let bestResult: ShuffleResult | null = null;
  let bestViolationCount = Infinity;

  const tryArrange = (
    relaxOffset: number,
  ): ShuffleResult | null => {
    const maxAttempts = 200;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 빈 그리드 생성
      const grid: (string | null)[][] = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => null),
      );

      // 사용된 자리 추적
      const occupied = new Set<string>(); // "r,c"

      // 1단계: 고정 좌석 배치
      let fixedFailed = false;
      for (const [, fc] of fixedMap) {
        if (fc.row < rows && fc.col < cols) {
          grid[fc.row]![fc.col] = fc.studentId;
          occupied.add(`${fc.row},${fc.col}`);
        } else {
          fixedFailed = true;
        }
      }
      if (fixedFailed) continue;

      // 2단계: 영역 고정 학생 배치
      let zoneFailed = false;
      for (const zc of zoneStudents) {
        const zonePositions = getZonePositions(zc.zone, rows, cols);
        const available = zonePositions.filter(
          (p) => !occupied.has(`${p.row},${p.col}`),
        );
        if (available.length === 0) {
          zoneFailed = true;
          break;
        }
        const pick = available[Math.floor(random() * available.length)]!;
        grid[pick.row]![pick.col] = zc.studentId;
        occupied.add(`${pick.row},${pick.col}`);
      }
      if (zoneFailed) continue;

      // 3단계: 나머지 학생 → 남은 빈 자리에 배치
      const freeSlots: { row: number; col: number }[] = [];
      if (options?.pairMode) {
        // 짝꿍 모드: 그룹 구조 순서로 빈 자리 나열
        const groups = buildPairGroups(cols, options.oddColumnMode ?? 'single');
        for (let r = 0; r < rows; r++) {
          for (const group of groups) {
            for (let c = group.startCol; c <= group.endCol; c++) {
              if (!occupied.has(`${r},${c}`)) {
                freeSlots.push({ row: r, col: c });
              }
            }
          }
        }
      } else {
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (!occupied.has(`${r},${c}`)) {
              freeSlots.push({ row: r, col: c });
            }
          }
        }
      }

      const shuffledFree = fisherYatesShuffle(freeStudents, random);
      for (let i = 0; i < shuffledFree.length && i < freeSlots.length; i++) {
        const slot = freeSlots[i]!;
        grid[slot.row]![slot.col] = shuffledFree[i]!;
      }
      // 남은 빈 슬롯은 null 유지 (빈 자리)

      // 4단계: 분리/인접 검증
      const violations: string[] = [];

      for (const sep of separations) {
        const posA = findStudentPosition(grid, sep.studentA);
        const posB = findStudentPosition(grid, sep.studentB);
        if (posA && posB) {
          const effectiveMin = Math.max(1, sep.minDistance - relaxOffset);
          const dist = manhattanDistance(posA.row, posA.col, posB.row, posB.col);
          if (dist < effectiveMin) {
            violations.push(`분리 위반: ${sep.studentA}-${sep.studentB}`);
          }
        }
      }

      for (const adj of adjacencies) {
        const posA = findStudentPosition(grid, adj.studentA);
        const posB = findStudentPosition(grid, adj.studentB);
        if (posA && posB) {
          const dist = manhattanDistance(posA.row, posA.col, posB.row, posB.col);
          if (dist > adj.maxDistance) {
            violations.push(`인접 위반: ${adj.studentA}-${adj.studentB}`);
          }
        }
      }

      // 최선의 결과 추적
      if (violations.length < bestViolationCount) {
        bestViolationCount = violations.length;
        bestResult = {
          seats: grid,
          success: violations.length === 0,
          attempts: attempt,
          relaxed: relaxOffset > 0,
          violations,
        };
      }

      if (violations.length === 0) {
        return {
          seats: grid,
          success: true,
          attempts: attempt,
          relaxed: relaxOffset > 0,
          violations: [],
        };
      }
    }

    return null; // maxAttempts 초과
  };

  // 1차: 원본 조건으로 시도
  const firstTry = tryArrange(0);
  if (firstTry) return firstTry;

  // 2차: 분리 거리 -1 완화
  const relaxedTry = tryArrange(1);
  if (relaxedTry) return relaxedTry;

  // 3차: 분리 거리 -2 완화
  const moreRelaxed = tryArrange(2);
  if (moreRelaxed) return moreRelaxed;

  // 최종 실패: 최선의 배치 반환
  if (bestResult) return bestResult;

  // 극단적 폴백: 조건 무시 셔플
  return {
    seats: shuffleSeats(seats, random),
    success: false,
    attempts: 600,
    relaxed: true,
    violations: ['모든 배치 시도 실패'],
  };
}

/**
 * 격자 순서를 유지하며 모둠을 배정합니다 (랜덤 없음).
 * allStudentIds는 격자 순서(row-major)로 전달됩니다.
 */
export function assignGroupsInOrder(
  studentIds: string[],
  groupCount: number,
  maxSize: number,
): SeatGroup[] {
  const groups: SeatGroup[] = [];
  let idx = 0;
  for (let g = 0; g < groupCount; g++) {
    const groupStudents = studentIds.slice(idx, idx + maxSize);
    if (groupStudents.length === 0) break;
    groups.push({
      id: `grp-${Date.now()}-${g}`,
      name: `${g + 1}모둠`,
      color: GROUP_COLORS[g % GROUP_COLORS.length]!,
      studentIds: groupStudents,
      maxSize,
    });
    idx += maxSize;
  }
  return groups;
}

/**
 * 모둠 랜덤 배치: 학생들을 모둠에 균등 분배 (라운드로빈)
 */
export function shuffleGroups(
  studentIds: string[],
  groupCount: number,
  maxSize: number,
  existingGroups: readonly SeatGroup[],
  random: () => number = Math.random,
): SeatGroup[] {
  const shuffled = fisherYatesShuffle([...studentIds], random);
  const groups: SeatGroup[] = [];

  for (let i = 0; i < groupCount; i++) {
    const base = existingGroups[i];
    groups.push({
      id: base?.id ?? `grp-${Date.now()}-${i}`,
      name: base?.name ?? `${i + 1}모둠`,
      color: base?.color ?? GROUP_COLORS[i % GROUP_COLORS.length]!,
      studentIds: [],
      maxSize,
    });
  }

  // 라운드로빈 분배
  shuffled.forEach((sid, idx) => {
    const groupIdx = idx % groupCount;
    const group = groups[groupIdx]!;
    if (group.studentIds.length < group.maxSize) {
      groups[groupIdx] = { ...group, studentIds: [...group.studentIds, sid] };
    }
  });

  return groups;
}

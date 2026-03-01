import type { SeatingData } from '../entities/Seating';
import type { Student } from '../entities/Student';

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

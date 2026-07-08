/**
 * 학번(번호) 무결성 규칙.
 *
 * 배경: 출결은 학생을 "번호"로 식별한다(StudentAttendance.number, studentKey).
 * 번호가 비었거나(0/미입력) 여러 학생이 같은 번호를 공유하면, 한 학생의 출결
 * 조작이 같은 번호를 가진 다른 학생에게도 반영되어 "한 명 → 전원" 오염이 발생한다.
 *
 * 이 규칙은 그런 위험을 사전에 탐지(경고용)하고, **아직 출결/좌석 데이터가 없는
 * 신규 명렬표(붙여넣기·일괄 등록)에 한해** 안전하게 번호를 다시 부여한다.
 *
 * ⚠️ 이미 저장된 출결(번호 키)·좌석(studentKey)이 있는 기존 명렬표에는
 * assignSequentialNumbers 를 적용하지 말 것 — 기존 데이터와 매핑이 어긋난다.
 */

/** 번호 식별 항목 — 수업반(number) / 담임(studentNumber) 공통 추상 */
export interface StudentNumberEntry {
  readonly number?: number;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface StudentNumberIssues {
  /** 번호가 없거나 0 이하인 학생 수 */
  readonly missingCount: number;
  /** 2명 이상이 공유하는 식별 키 목록 (번호 중복) */
  readonly duplicateKeys: readonly string[];
  /** 하나라도 문제가 있으면 true — 출결이 학생끼리 섞일 위험 */
  readonly hasCollisionRisk: boolean;
}

/** studentKey 와 동일 규칙. 단 번호 누락 시 빈 자리로 표기해 누락끼리도 한 키로 묶인다. */
function keyOf(e: StudentNumberEntry): string {
  const num = e.number == null ? '' : String(e.number);
  if (e.grade != null && e.classNum != null) return `${e.grade}-${e.classNum}-${num}`;
  return num;
}

/**
 * 명렬표에서 번호 누락/중복을 탐지한다. (비파괴 — 읽기 전용)
 */
export function detectStudentNumberIssues(
  students: readonly StudentNumberEntry[],
): StudentNumberIssues {
  let missingCount = 0;
  const keyCount = new Map<string, number>();
  for (const s of students) {
    if (s.number == null || s.number <= 0) missingCount += 1;
    const k = keyOf(s);
    keyCount.set(k, (keyCount.get(k) ?? 0) + 1);
  }
  const duplicateKeys: string[] = [];
  for (const [k, count] of keyCount) {
    if (count > 1) duplicateKeys.push(k);
  }
  return {
    missingCount,
    duplicateKeys,
    hasCollisionRisk: missingCount > 0 || duplicateKeys.length > 0,
  };
}

/**
 * 신규 명렬표에 한해 순번을 다시 부여한다.
 * 같은 학년-반 그룹 안에서 입력 순서대로 1..N, 학년/반이 없으면 전체를 1..N.
 * 원본 순서는 보존하고 number 만 교체한다.
 *
 * ⚠️ 기존 출결/좌석이 있는 명렬표에는 사용 금지(매핑 어긋남).
 */
export function assignSequentialNumbers<T extends StudentNumberEntry>(students: readonly T[]): T[] {
  const perGroup = new Map<string, number>();
  return students.map((s) => {
    const groupKey = s.grade != null && s.classNum != null ? `${s.grade}-${s.classNum}` : '';
    const next = (perGroup.get(groupKey) ?? 0) + 1;
    perGroup.set(groupKey, next);
    return { ...s, number: next };
  });
}

/**
 * 번호가 없거나(0/미입력) 겹친 학생에게만 미사용 번호를 새로 배정해 충돌을 없앤다.
 *
 * assignSequentialNumbers(전체 1..N 재부여)와 달리 **유효하고 고유한 번호는 그대로 보존**한다.
 * 정상 번호를 가진 학생의 기존 출결/좌석 매핑을 최대한 건드리지 않기 위함(과거 데이터 보호).
 * 같은 학년-반 그룹 안에서만 충돌을 따진다(학년/반이 없으면 전체를 한 그룹으로).
 * 원본 순서는 보존하고, 재배정이 필요한 학생의 number 만 교체한다.
 *
 * 재배정 번호는 그룹 내 "가장 작은 미사용 양수"부터 채운다(빈 번호 우선 메움).
 * 결과는 항상 detectStudentNumberIssues(...).hasCollisionRisk === false 를 만족한다.
 *
 * ⚠️ 이미 저장된 출결이 있는 기존 명렬표에 쓸 때: 번호가 바뀌는 학생의 과거 기록은
 *   매핑이 어긋날 수 있다(단, 그 학생은 애초에 번호가 겹쳐 이미 오염 상태였음).
 */
export function reassignConflictingNumbers<T extends StudentNumberEntry>(
  students: readonly T[],
): T[] {
  const groupKey = (e: StudentNumberEntry): string =>
    e.grade != null && e.classNum != null ? `${e.grade}-${e.classNum}` : '';

  // 그룹별 유효 번호(>0) 출현 횟수
  const counts = new Map<string, Map<number, number>>();
  for (const s of students) {
    if (s.number == null || s.number <= 0) continue;
    const g = groupKey(s);
    const m = counts.get(g) ?? new Map<number, number>();
    m.set(s.number, (m.get(s.number) ?? 0) + 1);
    counts.set(g, m);
  }

  // 보존 대상 = 유효 & 그룹 내 고유(정확히 1회 등장) 번호
  const kept = new Map<string, Set<number>>();
  for (const [g, m] of counts) {
    const set = new Set<number>();
    for (const [num, c] of m) if (c === 1) set.add(num);
    kept.set(g, set);
  }

  // 그룹별 사용 중 번호(보존분으로 초기화) + 다음 후보 포인터(단조 증가라 재스캔 불필요)
  const used = new Map<string, Set<number>>();
  for (const [g, set] of kept) used.set(g, new Set(set));
  const ptr = new Map<string, number>();

  const takeSmallestFree = (g: string): number => {
    const u = used.get(g) ?? new Set<number>();
    used.set(g, u);
    let n = ptr.get(g) ?? 1;
    while (u.has(n)) n += 1;
    u.add(n);
    ptr.set(g, n + 1);
    return n;
  };

  return students.map((s) => {
    const g = groupKey(s);
    const keptSet = kept.get(g);
    // 유효·고유 번호는 그대로 보존
    if (s.number != null && s.number > 0 && keptSet?.has(s.number)) return s;
    // 누락/0/중복 → 미사용 번호 재배정
    return { ...s, number: takeSmallestFree(g) };
  });
}

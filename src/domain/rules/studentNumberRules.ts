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

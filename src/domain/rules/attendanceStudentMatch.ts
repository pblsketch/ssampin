import type { StudentAttendance } from '@domain/entities/Attendance';
import { studentKey } from '@domain/entities/TeachingClass';

/**
 * 출결 항목을 명단 학생에 잇는 공통 규칙.
 *
 * 수업반 출결 항목은 `번호 + 학년 + 반` 으로 학생을 가리킨다(여러 학급에서 모인 수업반은
 * 번호가 겹친다). 그런데 학년·반 없이 **번호만** 저장된 항목이 있다 — AI 연결(브릿지)이
 * 앱이 켜진 채 쓴 옛 기록이 그렇다. 화면마다 키 문자열을 따로 비교하면 그런 항목이
 * 통계에서 빠지고, 조회에서는 "?" 로 뜨고, 입력 화면에서는 출석으로 보인다.
 *
 * 규칙은 하나다:
 *  1. 학생 키(학년-반-번호)가 정확히 같으면 그 학생이다.
 *  2. 아니면 **그 번호가 명단에 한 명뿐이고** 학년·반이 서로 어긋나지 않을 때만 그 학생이다.
 *  3. 그 밖에는 누구인지 정하지 않는다(번호가 겹치면 짐작하지 않는다).
 *
 * ★매칭은 명단의 실제 `number`/`grade`/`classNum` 으로만 한다. 배열에서의 위치를 번호로
 *   쓰지 않는다. 명단은 **걸러 내지 않은 전체**를 넘긴다 — 지금은 수업을 안 듣는 학생도
 *   같은 번호를 쓰고 있었다면 "유일하다"고 볼 수 없다.
 *
 * 저장된 파일은 고치지 않는다(읽을 때만 잇는다).
 */

/** 출결 항목과 명단 학생이 함께 갖는 식별 필드 */
export interface AttendanceStudentRef {
  readonly number: number;
  readonly grade?: number;
  readonly classNum?: number;
}

/** 번호·학년·반이 모두 같은가 — 저장된 두 항목이 "같은 학생 칸"인지 가른다 */
export function isSameAttendanceStudent(a: AttendanceStudentRef, b: AttendanceStudentRef): boolean {
  return (
    a.number === b.number &&
    (a.grade ?? null) === (b.grade ?? null) &&
    (a.classNum ?? null) === (b.classNum ?? null)
  );
}

/** 둘 다 적혀 있는데 값이 다른 학년·반이 있는가 */
function identityConflicts(a: AttendanceStudentRef, b: AttendanceStudentRef): boolean {
  if (a.grade != null && b.grade != null && a.grade !== b.grade) return true;
  if (a.classNum != null && b.classNum != null && a.classNum !== b.classNum) return true;
  return false;
}

export interface ResolvedAttendanceEntry<T, R> {
  readonly entry: T;
  /** 이 항목이 가리키는 명단 학생. 명단에서 정할 수 없으면 null */
  readonly student: R | null;
  /** 그 학생의 키(`studentKey`). 정할 수 없으면 null */
  readonly key: string | null;
}

export interface AttendanceRosterMatcher<R extends AttendanceStudentRef> {
  /** 출결 항목 하나가 가리키는 명단 학생 */
  readonly resolveStudent: (entry: AttendanceStudentRef) => R | null;
  /** 출결 항목 하나가 가리키는 명단 학생의 키 */
  readonly resolveKey: (entry: AttendanceStudentRef) => string | null;
  /**
   * 한 교시의 항목들을 학생에 잇는다(순서 유지).
   * 같은 학생에 둘 이상이 걸리면 키가 정확히 맞는 항목만 남긴다 — 번호만 있는 옛 항목과
   * 새로 적은 항목이 함께 있을 때 한 학생이 두 번 세어지지 않게 한다.
   * 누구인지 못 정한 항목(`key === null`)은 버리지 않고 그대로 돌려준다.
   */
  readonly resolveEntries: <T extends AttendanceStudentRef>(
    entries: readonly T[],
  ) => ResolvedAttendanceEntry<T, R>[];
  /** 한 교시의 항목들을 학생 키로 찾을 수 있게 묶는다(못 정한 항목은 빠진다) */
  readonly indexByStudentKey: <T extends AttendanceStudentRef>(
    entries: readonly T[],
  ) => Map<string, T>;
}

export function createAttendanceRosterMatcher<R extends AttendanceStudentRef>(
  roster: readonly R[],
): AttendanceRosterMatcher<R> {
  const byKey = new Map<string, R>();
  const byNumber = new Map<number, R[]>();
  for (const student of roster) {
    const key = studentKey(student);
    if (!byKey.has(key)) byKey.set(key, student);
    const sameNumber = byNumber.get(student.number);
    if (sameNumber) sameNumber.push(student);
    else byNumber.set(student.number, [student]);
  }

  const resolveStudent = (entry: AttendanceStudentRef): R | null => {
    const exact = byKey.get(studentKey(entry));
    if (exact !== undefined && !identityConflicts(entry, exact)) return exact;
    // ★번호가 명단에 한 명뿐일 때만 번호로 잇는다. 둘 이상이면 짐작하지 않는다.
    const sameNumber = byNumber.get(entry.number);
    if (sameNumber === undefined || sameNumber.length !== 1) return null;
    const only = sameNumber[0]!;
    return identityConflicts(entry, only) ? null : only;
  };

  const resolveKey = (entry: AttendanceStudentRef): string | null => {
    const student = resolveStudent(entry);
    return student === null ? null : studentKey(student);
  };

  const resolveEntries = <T extends AttendanceStudentRef>(
    entries: readonly T[],
  ): ResolvedAttendanceEntry<T, R>[] => {
    const resolved = entries.map((entry): ResolvedAttendanceEntry<T, R> => {
      const student = resolveStudent(entry);
      return { entry, student, key: student === null ? null : studentKey(student) };
    });
    // 학생마다 남길 항목 하나 — 키가 정확히 맞는 것이 먼저, 같으면 앞선 것.
    const winner = new Map<string, number>();
    resolved.forEach((item, index) => {
      if (item.key === null) return;
      const current = winner.get(item.key);
      if (current === undefined) {
        winner.set(item.key, index);
        return;
      }
      const currentExact = studentKey(resolved[current]!.entry) === item.key;
      const thisExact = studentKey(item.entry) === item.key;
      if (!currentExact && thisExact) winner.set(item.key, index);
    });
    return resolved.filter((item, index) => item.key === null || winner.get(item.key) === index);
  };

  const indexByStudentKey = <T extends AttendanceStudentRef>(
    entries: readonly T[],
  ): Map<string, T> => {
    const index = new Map<string, T>();
    for (const item of resolveEntries(entries)) {
      if (item.key !== null) index.set(item.key, item.entry);
    }
    return index;
  };

  return { resolveStudent, resolveKey, resolveEntries, indexByStudentKey };
}

/**
 * 한 교시 출결에 **이번에 든 학생만** 갈아 끼운다. 나머지 학생 항목은 그대로 둔다.
 *
 * "같은 학생"은 명단으로 가른다 — 번호가 겹치는 수업반에서는 학년-반-번호가 같아야 같은
 * 학생이고, 번호만 있는 옛 항목은 그 번호가 명단에 한 명뿐일 때 그 학생의 것으로 보아
 * 새 항목으로 바꾼다(한 학생이 두 줄이 되지 않게). 명단에서 못 정한 항목끼리는
 * 번호·학년·반이 모두 같을 때만 같은 칸으로 본다.
 *
 * 이번 호출 안에 같은 학생이 두 번 들어 있으면 뒤엣것이 남는다.
 */
export function mergeAttendanceStudents<T extends AttendanceStudentRef>(
  existing: readonly T[],
  incoming: readonly T[],
  roster: readonly AttendanceStudentRef[],
): T[] {
  const matcher = createAttendanceRosterMatcher(roster);
  const identityOf = (entry: AttendanceStudentRef): string => {
    const key = matcher.resolveKey(entry);
    return key !== null
      ? `roster:${key}`
      : `raw:${entry.grade ?? ''}-${entry.classNum ?? ''}-${entry.number}`;
  };
  const next = new Map<string, T>();
  for (const entry of incoming) next.set(identityOf(entry), entry);
  const kept = existing.filter((entry) => !next.has(identityOf(entry)));
  return [...kept, ...next.values()];
}

export type IncomingAttendanceResolution<T> =
  | { readonly ok: true; readonly students: T[] }
  /** 누구인지 정할 수 없는 번호들(오름차순, 중복 없음) — 아무것도 저장하면 안 된다 */
  | { readonly ok: false; readonly ambiguousNumbers: number[] };

/**
 * 밖에서 들어온 출결 항목(AI 연결 등)을 저장하기 전에 명단에 맞춘다.
 *
 *  - 명단에서 학생이 정해지면(키가 같거나, 그 번호가 명단에 한 명뿐이면) **명단의 학년·반을
 *    실어** 돌려준다 — 번호만으로 저장하면 나중에 같은 번호 학생이 들어왔을 때 누구 것인지 잃는다.
 *  - 학년·반 없이(둘 중 하나라도 없이) 왔는데 **그 번호가 명단에 둘 이상**이면 정할 수 없다.
 *    그대로 저장하면 "저장 완료"인데 통계·입력 화면 어디에도 안 보이는 항목이 된다 → 거부한다.
 *    하나라도 그러면 호출 전체를 거부한다(일부만 저장하면 보낸 쪽이 무엇이 빠졌는지 모른다).
 *  - 그 밖(명단에 없는 번호, 학년·반까지 적었는데 명단에 없는 학생)은 받은 그대로 둔다.
 *
 * `roster` 는 걸러 내지 않은 명단 전체다.
 */
export function resolveIncomingAttendanceStudents<T extends AttendanceStudentRef>(
  incoming: readonly T[],
  roster: readonly AttendanceStudentRef[],
): IncomingAttendanceResolution<T> {
  const matcher = createAttendanceRosterMatcher(roster);
  const countByNumber = new Map<number, number>();
  for (const student of roster) {
    countByNumber.set(student.number, (countByNumber.get(student.number) ?? 0) + 1);
  }

  const ambiguous = new Set<number>();
  const students = incoming.map((entry): T => {
    const student = matcher.resolveStudent(entry);
    if (student !== null) {
      if (student.grade == null || student.classNum == null) return entry;
      return { ...entry, grade: student.grade, classNum: student.classNum };
    }
    const lacksIdentity = entry.grade == null || entry.classNum == null;
    if (lacksIdentity && (countByNumber.get(entry.number) ?? 0) > 1) ambiguous.add(entry.number);
    return entry;
  });

  if (ambiguous.size > 0) {
    return { ok: false, ambiguousNumbers: [...ambiguous].sort((a, b) => a - b) };
  }
  return { ok: true, students };
}

/**
 * 입력 화면에 띄울 학생별 출결 줄.
 *
 * 저장된 항목을 명단 학생에 이어 붙이되, 줄에는 **명단의** 번호·학년·반을 싣는다.
 * 그래서 번호만 있던 옛 항목을 살려 보여 준 뒤 교사가 저장하면 학년-반-번호 키로
 * 다시 저장된다 — 옛 항목과 새 항목이 나란히 남지 않는다(화면 저장은 그 교시를 통째로 쓴다).
 *
 * @param students 화면에 띄울 학생(보통 재적 학생만)
 * @param roster   그 수업반 명단 **전체** — 번호가 유일한지 가르는 데 쓴다
 * @param saved    그 교시에 저장돼 있는 항목. 없으면 전원 출석으로 시작한다
 */
export function buildAttendanceRows(
  students: readonly AttendanceStudentRef[],
  roster: readonly AttendanceStudentRef[],
  saved: readonly StudentAttendance[] | undefined,
): StudentAttendance[] {
  const index = createAttendanceRosterMatcher(roster).indexByStudentKey(saved ?? []);
  return students.map((student) => {
    const prev = index.get(studentKey(student));
    return {
      number: student.number,
      grade: student.grade,
      classNum: student.classNum,
      status: prev?.status ?? 'present',
      reason: prev?.reason,
      memo: prev?.memo,
    };
  });
}

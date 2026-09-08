/**
 * 명렬표의 "진짜 번호"를 확정하는 규칙.
 *
 * 배경(2026-09-08 학생 번호 무결성 검토): 여러 화면이 **배열 위치(`index + 1`)** 를 학생 번호로 썼다.
 * 2번 학생이 전출하면 3번이 2번으로 밀려 과제·설문·PIN·CSV가 전부 다른 학생을 가리켰다.
 *
 * 이 모듈은 그 한 가지만 한다 — 담임(`studentNumber`)과 수업반(`number`)의 서로 다른 필드 이름을
 * 하나로 모으고, **번호가 없거나 겹친 학생만** 미사용 번호로 채운다. 정상 번호는 절대 바꾸지 않는다.
 *
 * ⚠️ 배열 위치·정렬 순서·활성 학생 수를 학생 식별자로 쓰지 말 것. 그게 원래 사고의 원인이다.
 */
import type { StudentStatus } from '@domain/entities/Student';
import { isStudentActive } from '@domain/rules/studentActivity';
import { reassignConflictingNumbers } from '@domain/rules/studentNumberRules';

/** 담임 학생(`studentNumber`)과 수업반 학생(`number`)을 함께 받는 최소 형태. */
export interface RosterNumberSource {
  /** 수업반 학생의 출석번호 */
  readonly number?: number;
  /** 담임 학생의 출석번호 */
  readonly studentNumber?: number;
  readonly grade?: number;
  readonly classNum?: number;
  readonly status?: StudentStatus;
  readonly isVacant?: boolean;
}

/** 명렬표에 실제로 적힌 번호. 없거나 0 이하면 `undefined`. */
export function rosterNumberOf(s: RosterNumberSource): number | undefined {
  const raw = s.number ?? s.studentNumber;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return undefined;
  return raw;
}

export interface NumberedRosterEntry<T> {
  readonly student: T;
  readonly number: number;
  /** 명렬표에 번호가 없거나 겹쳐서 **이 자리에서 채운** 번호인가. 화면 경고에 쓴다. */
  readonly filled: boolean;
}

/**
 * 명렬표 전체에 번호를 확정한다. 순서는 원본 그대로.
 *
 * - 유효하고(>0) 그룹 안에서 유일한 번호는 **그대로** 둔다.
 * - 번호가 없거나 겹친 학생만 그룹 안 "가장 작은 미사용 번호"로 채운다(`reassignConflictingNumbers`).
 * - 그룹은 학년·반이 둘 다 있으면 `학년-반`, 아니면 전체 하나(담임반).
 */
export function numberRoster<T extends RosterNumberSource>(
  all: readonly T[],
): NumberedRosterEntry<T>[] {
  const resolved = reassignConflictingNumbers(
    all.map((s) => ({
      number: rosterNumberOf(s),
      ...(s.grade !== undefined ? { grade: s.grade } : {}),
      ...(s.classNum !== undefined ? { classNum: s.classNum } : {}),
    })),
  );
  return all.map((student, i) => {
    const original = rosterNumberOf(student);
    const number = resolved[i]?.number ?? i + 1;
    return { student, number, filled: original !== number };
  });
}

/**
 * **비활성 학생을 뺀** 명렬표에 번호를 확정한다.
 *
 * ★번호 계산은 전체 명렬표에서 먼저 하고 그다음에 거른다. 그래야 전출 학생이 쓰던 번호가
 *   "빈 번호"로 남고, 번호 없는 다른 학생에게 그 번호가 넘어가지 않는다.
 */
export function numberActiveRoster<T extends RosterNumberSource>(
  all: readonly T[],
): NumberedRosterEntry<T>[] {
  return numberRoster(all).filter((e) => isStudentActive(e.student));
}

/** 활성 학생의 번호만 오름차순으로. 설문 허용 번호 목록·PIN 대상에 쓴다. */
export function activeRosterNumbers(all: readonly RosterNumberSource[]): number[] {
  return numberActiveRoster(all)
    .map((e) => e.number)
    .sort((a, b) => a - b);
}

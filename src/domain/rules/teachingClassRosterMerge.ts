/**
 * 수업반 명단 + 사진 명렬표 이름 = 합친 명단.
 *
 * ## 왜 필요한가
 *
 * 수업반에서 사진 명렬표를 넣으면 예전에는 **사진만** 붙였다. 그런데 수업반 명렬표에는
 * 학년·반·번호·이름이 모두 적혀 있어 그 자체로 명단이 된다. 명단이 비어 있는 수업반에
 * 사진 명렬표를 넣으면 붙일 학생이 하나도 없으니 `사진 0장을 넣었어요 (22장은 명단과 맞지
 * 않아 넣지 못했어요)` 만 뜨고, 선생님은 **왜 안 되는지 알 수 없었다.**
 * (창에는 "이 수업반 명단에 반영합니다", 버튼에는 "명단에 반영"이라고 적혀 있었으므로
 * 화면이 약속한 것과 실제 동작이 달랐다.)
 *
 * ## 왜 덮어쓰지 않고 더하기만 하는가
 *
 * 수업반의 출결·좌석·수행평가는 **번호**에 묶여 있다. 이미 있는 학생의 이름을 파일 값으로
 * 갈아 끼우면 기록이 조용히 다른 사람 것이 된다. 그래서 **없는 학생만 더하고, 있는 학생은
 * 손대지 않는다.** 이름이 다른 경우는 사진도 붙지 않고 "명단과 맞지 않음"으로 보고된다 —
 * 선생님이 직접 판단할 문제이기 때문이다.
 */

import type { TeachingClassStudent } from '@domain/entities/TeachingClass';
import { compareRosterRows, rosterRowKey } from '@domain/rules/rosterNameCell';

/** 사진 명렬표에서 읽어 낸 이름 한 줄 */
export interface RosterNameLike {
  readonly studentNumber: number;
  readonly name: string;
  readonly grade?: number;
  readonly classNum?: number;
}

export interface RosterMergeResult {
  /** 합친 명단 (학년 → 반 → 번호 순) */
  readonly students: readonly TeachingClassStudent[];
  /** 새로 더해진 학생 수 — 0이면 저장할 필요가 없다 */
  readonly added: number;
}

function keyOfStudent(s: TeachingClassStudent): string {
  return rosterRowKey({
    studentNumber: s.number,
    ...(s.grade !== undefined ? { grade: s.grade } : {}),
    ...(s.classNum !== undefined ? { classNum: s.classNum } : {}),
  });
}

export function mergeRosterFromPhotoRoster(
  existing: readonly TeachingClassStudent[],
  names: readonly RosterNameLike[],
): RosterMergeResult {
  const seen = new Set(existing.map(keyOfStudent));
  const additions: TeachingClassStudent[] = [];

  for (const n of names) {
    const key = rosterRowKey(n);
    if (seen.has(key)) continue;
    seen.add(key); // 파일 안에 같은 학생이 두 번 있어도 한 번만 더한다
    additions.push({
      number: n.studentNumber,
      name: n.name,
      ...(n.grade !== undefined ? { grade: n.grade } : {}),
      ...(n.classNum !== undefined ? { classNum: n.classNum } : {}),
    });
  }

  if (additions.length === 0) return { students: existing, added: 0 };

  const merged = [...existing, ...additions].sort((a, b) =>
    compareRosterRows(
      {
        studentNumber: a.number,
        ...(a.grade !== undefined ? { grade: a.grade } : {}),
        ...(a.classNum !== undefined ? { classNum: a.classNum } : {}),
      },
      {
        studentNumber: b.number,
        ...(b.grade !== undefined ? { grade: b.grade } : {}),
        ...(b.classNum !== undefined ? { classNum: b.classNum } : {}),
      },
    ),
  );
  return { students: merged, added: additions.length };
}

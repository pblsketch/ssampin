/**
 * 점검 날짜 규칙 — "다시 확인할 날"을 다루는 순수 로직.
 *
 * 마감일(`dueDate`)과 점검 날짜(`checkAt`)는 다른 것이다. 마감은 "내가 끝내는 날",
 * 점검은 "내가 다시 봐야 하는 날"이다. 공문 회신 대기처럼 마감은 다음 주인데
 * 오늘 한 번 확인해야 하는 일이 교사 업무에 흔하다.
 *
 * ★ 이 파일은 **시계를 직접 읽지 않는다.** `new Date()`·`Date.now()`를 쓰지 않고
 *   오늘 날짜를 문자열로 받는다. 날짜는 전부 "YYYY-MM-DD" 형식이라 사전순 비교가
 *   곧 시간순 비교다 — 시간대에 휘둘리지 않는 유일한 방법이다.
 *   (`scripts/regression-grep-check.mjs`의 규칙이 이 파일에서 시계 읽기를 막는다.)
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { Todo } from '../entities/Todo';

/** "YYYY-MM-DD" 형식인지. 자릿수만 본다(달·일의 유효 범위까지는 보지 않는다). */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(v: string | undefined): v is string {
  return v !== undefined && DATE_PATTERN.test(v);
}

/** 점검 날짜를 꺼낸다. 형식이 아니면 없는 것으로 본다(깨진 값이 판정을 흔들지 않게). */
export function parseCheckAt(todo: Todo): string | null {
  return isDateString(todo.checkAt) ? todo.checkAt : null;
}

/**
 * 오늘 확인해야 하는 할 일인가 — 점검 날짜가 오늘이거나 **이미 지났으면** 참.
 *
 * 지난 것을 포함하는 이유: 어제 확인했어야 하는 일이 조용히 사라지면 그게 더 나쁘다.
 * 완료·보관된 할 일은 대상이 아니다.
 */
export function isCheckDue(todo: Todo, todayStr: string): boolean {
  if (todo.completed) return false;
  if (todo.archivedAt !== undefined) return false;
  const checkAt = parseCheckAt(todo);
  return checkAt !== null && checkAt <= todayStr;
}

/**
 * 다음에 손대야 하는 날 — 점검 날짜와 마감일 중 **이른 쪽**.
 *
 * 목록을 "곧 손댈 것부터" 정렬할 때 쓴다. 둘 다 없으면 null.
 */
export function nextTouchDate(todo: Todo): string | null {
  const checkAt = parseCheckAt(todo);
  const due = isDateString(todo.dueDate) ? todo.dueDate : null;
  if (checkAt === null) return due;
  if (due === null) return checkAt;
  return checkAt <= due ? checkAt : due;
}

/**
 * 다음에 손댈 날짜 순 비교기 — 날짜가 없는 항목은 **뒤로** 보낸다.
 *
 * 날짜 없는 것을 앞에 두면 "언제 해도 되는 일"이 목록 맨 위를 차지한다.
 */
export function compareByNextTouch(a: Todo, b: Todo): number {
  const da = nextTouchDate(a);
  const db = nextTouchDate(b);
  if (da === null && db === null) return 0;
  if (da === null) return 1;
  if (db === null) return -1;
  if (da === db) return 0;
  return da < db ? -1 : 1;
}

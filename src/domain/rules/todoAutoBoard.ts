/**
 * 자동 배치 보드 규칙 — 카드를 손으로 옮기지 않아도 날짜가 자리를 정한다.
 *
 * 기존 칸반은 사용자가 카드를 끌어야 칸이 바뀐다. 자동 보드는 **마감일과 점검 날짜만
 * 보고** 자리를 정한다. 정리하는 일 자체를 없애는 것이 목적이다.
 *
 * ★ 이 규칙이 지키는 두 가지 약속
 *  1. **완료된 할 일은 어느 칸에도 배정하지 않는다.** 반환 타입에 `done` 칸이 아예 없고,
 *     완료 항목에는 `null` 을 준다. 그래서 "완료가 풀리는 경로"가 구조적으로 없다.
 *  2. **상태를 직접 만들지 않는다.** 칸을 옮길 때 필요한 변경은 기존 `applyStatusChange`
 *     에 맡긴다. 그 함수는 `status`·`completed`·**서브태스크까지** 함께 맞춰 준다 —
 *     여기서 `status` 만 손으로 만들면 서브태스크가 어긋난다.
 *
 * ★ 시계를 직접 읽지 않는다. 오늘 날짜를 문자열로 받는다(회귀 검사 #58 이 강제).
 *
 * domain 레이어이므로 외부 의존성을 import 하지 않는다.
 */
import type { Todo } from '../entities/Todo';
import { inferStatus, applyStatusChange } from './todoRules';
import { isDateString, parseCheckAt } from './todoCheckRules';

/**
 * 보드의 칸. **`done` 이 없다** — 완료 항목은 보드에 올리지 않기 때문이다.
 * 없는 칸으로는 옮길 수 없으니, 자동 보드가 할 일을 완료 처리하는 일도 생기지 않는다.
 */
export type AutoBoardBucket = 'triage' | 'today' | 'inProgress' | 'upcoming';

export const AUTO_BOARD_BUCKETS: readonly AutoBoardBucket[] = [
  'triage',
  'today',
  'inProgress',
  'upcoming',
];

export const AUTO_BOARD_BUCKET_LABELS: Record<AutoBoardBucket, string> = {
  triage: '분류 대기',
  today: '오늘 처리',
  inProgress: '진행 중',
  upcoming: '예정·대기',
};

export const AUTO_BOARD_BUCKET_HINTS: Record<AutoBoardBucket, string> = {
  triage: '마감일도 확인할 날도 없는 일',
  today: '오늘까지거나 오늘 확인할 일',
  inProgress: '손을 대기 시작한 일',
  upcoming: '아직 날짜가 남은 일',
};

/**
 * 이 할 일이 갈 칸. 완료된 항목이면 **null**(보드에 올리지 않는다).
 *
 * 판정 순서에 뜻이 있다.
 *  - '진행 중'을 **날짜보다 먼저** 본다. 이미 손을 댄 일은 마감이 오늘이어도
 *    '오늘 처리'가 아니라 '진행 중'에 있어야 사용자의 머릿속과 맞는다.
 *  - 지난 날짜는 '오늘 처리'에 넣는다. 어제까지였던 일이 '예정'에 있으면 안 된다.
 *
 * @param todayStr "YYYY-MM-DD"
 */
export function bucketOf(todo: Todo, todayStr: string): AutoBoardBucket | null {
  // 완료된 일은 보드 밖이다. 이 한 줄이 "자동 보드가 완료를 건드린다"는 경로를 막는다.
  if (inferStatus(todo) === 'done') return null;

  if (inferStatus(todo) === 'inProgress') return 'inProgress';

  const due = isDateString(todo.dueDate) ? todo.dueDate : null;
  const check = parseCheckAt(todo);
  if (due === null && check === null) return 'triage';

  // 둘 중 이른 날짜가 오늘이거나 지났으면 오늘 볼 일이다.
  const earliest = due === null ? check : check === null ? due : check <= due ? check : due;
  if (earliest !== null && earliest <= todayStr) return 'today';

  return 'upcoming';
}

/** 보드에 올릴 목록만 골라 칸별로 나눈다. 호출자가 아카이브를 미리 걸러 넘긴다. */
export function groupByBucket(
  todos: readonly Todo[],
  todayStr: string,
): Record<AutoBoardBucket, readonly Todo[]> {
  const result: Record<AutoBoardBucket, Todo[]> = {
    triage: [],
    today: [],
    inProgress: [],
    upcoming: [],
  };
  for (const todo of todos) {
    const bucket = bucketOf(todo, todayStr);
    if (bucket === null) continue;
    result[bucket].push(todo);
  }
  return result;
}

/**
 * 카드를 다른 칸으로 끌었을 때 실제로 바꿀 값.
 *
 * ★ `status` 를 손으로 만들지 않는다 — `applyStatusChange` 가 `completed` 와
 *   서브태스크까지 함께 맞춰 주기 때문이다. 기존 수동 칸반도 같은 함수를 쓴다.
 *
 * 칸마다 바뀌는 것:
 *  - 분류 대기 → 날짜를 지운다(다시 분류 대상으로)
 *  - 오늘 처리 → 마감일을 오늘로
 *  - 진행 중 → 상태를 '진행 중'으로 (날짜는 건드리지 않는다)
 *  - 예정·대기 → 날짜를 지운다. **"언제로"를 우리가 정할 수 없기 때문이다** —
 *    임의로 내일이나 다음 주로 밀면 사용자가 적어 둔 일정을 앱이 지어내는 셈이다.
 *
 * '진행 중'에서 **빠져나올 때**는 상태를 '할 일'로 되돌린다. 원래 값 복원은 하지 않는다 —
 * 어떤 값이었는지 기억해 두지 않으므로 지킬 수 없는 약속이다.
 */
export function changesForBucketMove(
  todo: Todo,
  target: AutoBoardBucket,
  todayStr: string,
): Partial<Todo> {
  const wasInProgress = inferStatus(todo) === 'inProgress';

  if (target === 'inProgress') {
    return applyStatusChange(todo, 'inProgress');
  }

  // '진행 중'에서 나올 때만 상태를 되돌린다. 그 밖에는 상태를 건드리지 않는다.
  const statusPart: Partial<Todo> = wasInProgress ? applyStatusChange(todo, 'todo') : {};

  if (target === 'today') {
    return { ...statusPart, dueDate: todayStr };
  }
  // triage · upcoming — 날짜를 비운다
  return { ...statusPart, dueDate: undefined, checkAt: undefined };
}

/** 확인창에 띄울 한국어 문구. 무엇이 바뀌는지 **바뀌는 것만** 적는다. */
export function describeBucketMove(todo: Todo, target: AutoBoardBucket, todayStr: string): string {
  const changes = changesForBucketMove(todo, target, todayStr);
  const parts: string[] = [];

  if (changes.status === 'inProgress') parts.push("'진행 중'으로 표시합니다");
  if (changes.status === 'todo') parts.push("'진행 중' 표시를 지웁니다");
  if (changes.dueDate !== undefined) {
    const [, m, d] = changes.dueDate.split('-');
    parts.push(`마감일을 오늘(${Number(m)}/${Number(d)})로 바꿉니다`);
  } else if ('dueDate' in changes && isDateString(todo.dueDate)) {
    parts.push('마감일을 지웁니다');
  }
  if ('checkAt' in changes && changes.checkAt === undefined && parseCheckAt(todo) !== null) {
    parts.push('다시 확인할 날을 지웁니다');
  }

  if (parts.length === 0) return '바뀌는 내용이 없습니다.';
  return `${parts.join(', ')}. 진행할까요?`;
}

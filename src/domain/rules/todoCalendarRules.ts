/**
 * 할 일을 **일정 달력 위에 겹쳐 그리기** 위한 규칙 (2026-08-27).
 *
 * ── 왜 일정(SchoolEvent)으로 바꾸지 않는가 ──────────────────────────
 *
 * 할 일을 일정 데이터에 복사해 넣으면 세 가지가 한꺼번에 무너진다.
 *
 * 1) **구글에 유령 일정이 생긴다.** 할 일은 구글 *Tasks*, 일정은 구글 *캘린더*로
 *    각각 다른 길을 탄다. 달력에서 누른 것이 일정 편집 경로로 흘러가면 저장하는
 *    순간 구글 캘린더에 없던 사본이 만들어진다.
 * 2) **일정 내보내기에 개인 할 일이 딸려 나간다.** 학교에 일정 파일을 공유할 때
 *    학생 이름이 적힌 할 일이 섞여 나가면 되돌릴 수 없다.
 * 3) **일괄 삭제·중복 정리·나이스 동기화**가 할 일을 "출처 없는 일정"으로 보고
 *    지우거나 겹친 것으로 접는다.
 *
 * 그래서 이 파일은 할 일을 **그리기 위한 최소 정보(칩)** 로만 옮긴다. 원본은
 * 끝까지 할 일 쪽에 남고, 고치는 길도 할 일 쪽 유스케이스 하나뿐이다.
 * 온라인 교무실 부서 일정이 먼저 같은 결론에 닿았다(StaffRoomPlanOverlay 참고).
 */
import type { Todo, TodoPriority } from '@domain/entities/Todo';
import { civilFromDays, daysFromCivil, daysInMonth } from './todoTime';

/** 달력 한 칸에 그릴 할 일 하나 */
export interface TodoCalendarChip {
  readonly todoId: string;
  readonly title: string;
  /** 놓일 날짜 "YYYY-MM-DD" — 언제나 **마감일**이다 */
  readonly dateKey: string;
  readonly completed: boolean;
  /** 마감이 지났는데 아직 안 끝낸 것 */
  readonly overdue: boolean;
  /** "HH:mm" — 시각을 적어 둔 할 일만 */
  readonly time?: string;
  /** 할 일 카테고리 ID (색을 고를 때 쓴다) */
  readonly categoryId?: string;
  readonly priority: TodoPriority;
  /** 반복 할 일인가 — 완료하면 다음 회차가 새로 생긴다는 안내에 쓴다 */
  readonly isRecurring: boolean;
}

export interface TodoChipOptions {
  /** 완료한 할 일도 그릴지 (기본 false) */
  readonly includeCompleted?: boolean;
}

/** 드래그 이동 가능 여부 — 막을 때는 사용자에게 보여 줄 이유를 함께 준다 */
export type TodoDragCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const PRIORITY_ORDER: Record<TodoPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

/**
 * "YYYY-MM-DD" 형식이고 **실제로 있는 날짜**인가.
 *
 * 형식만 보면 `2026-02-31` 이 통과해 버린다. 마감일은 사용자가 직접 고르는 값이라
 * 대개 멀쩡하지만, 예전 데이터나 가져오기로 들어온 값까지 믿을 수는 없다.
 */
export function isDateKey(value: string | undefined): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(y, m);
}

/**
 * 날짜 계산은 **`Date` 없이 순수 산술**로 한다 — todoTime.ts 와 같은 규약이다.
 *
 * `new Date('2026-08-27')` 로 파싱해 `setDate()` 로 더하는 방식은 실행하는 컴퓨터의
 * 시간대로 해석돼, 개발자 PC(한국)와 CI(UTC)에서 결과가 갈린다. 마감일이 하루 밀리는
 * 고전적 함정이라 `scripts/regression-grep-check.mjs` 의 #58 규칙이 이 파일을 막고 있다.
 */
function toDays(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return daysFromCivil(y ?? 1970, m ?? 1, d ?? 1);
}

function fromDays(days: number): string {
  const { y, m, d } = civilFromDays(days);
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** 날짜 키에 일수를 더한다 */
export function addDaysToKey(key: string, days: number): string {
  return fromDays(toDays(key) + days);
}

/** 두 날짜 키 사이의 일수 (뒤 - 앞) */
export function daysBetweenKeys(from: string, to: string): number {
  return toDays(to) - toDays(from);
}

/**
 * 이 할 일을 달력에 그릴 것인가.
 *
 * - **마감일이 없으면 그리지 않는다.** 놓을 자리가 없다. "언젠가 할 일"은 할 일 목록의 몫이다.
 * - 보관함으로 내린 것(archivedAt)은 이미 끝난 일이라 그리지 않는다.
 * - 완료한 것은 기본으로 숨긴다 — 달력은 "앞으로 할 일"을 보는 화면이다.
 */
export function isTodoOnCalendar(todo: Todo, options: TodoChipOptions = {}): boolean {
  if (todo.archivedAt) return false;
  if (!isDateKey(todo.dueDate)) return false;
  if (todo.completed && options.includeCompleted !== true) return false;
  return true;
}

/** 할 일 하나 → 달력 칩 하나. `todayKey` 는 지난 마감을 가려내는 기준이다. */
export function toTodoCalendarChip(todo: Todo, todayKey: string): TodoCalendarChip {
  const dateKey = todo.dueDate ?? todayKey;
  return {
    todoId: todo.id,
    title: todo.text,
    dateKey,
    completed: todo.completed,
    overdue: !todo.completed && dateKey < todayKey,
    ...(todo.time ? { time: todo.time } : {}),
    ...(todo.category ? { categoryId: todo.category } : {}),
    priority: todo.priority ?? 'none',
    isRecurring: todo.recurrence !== undefined,
  };
}

/**
 * 같은 날 안에서의 순서.
 *
 * 안 끝낸 것 → 시각이 이른 것 → 우선순위 높은 것 → 제목 순. 완료한 것을 아래로 미는 이유는
 * 달력 칸이 두세 줄밖에 안 보여서, 위 칸을 이미 끝난 일에 내주면 정작 남은 일이 `+2개 더`
 * 뒤로 숨어 버리기 때문이다.
 */
export function compareTodoChips(a: TodoCalendarChip, b: TodoCalendarChip): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.time !== b.time) {
    if (a.time === undefined) return 1;
    if (b.time === undefined) return -1;
    return a.time.localeCompare(b.time);
  }
  const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (p !== 0) return p;
  return a.title.localeCompare(b.title);
}

/**
 * 한 달치 할 일을 **날짜별로 묶어서** 돌려준다.
 *
 * 달력은 칸마다 조회하므로 미리 Map 으로 만들어 둔다 — 칸마다 전체 목록을 훑으면
 * 할 일 300건 × 42칸이 매 렌더마다 돈다.
 *
 * @param monthKey "YYYY-MM" (예: "2026-08")
 * @param todayKey 오늘 "YYYY-MM-DD"
 */
export function getTodoChipsByDate(
  todos: readonly Todo[],
  monthKey: string,
  todayKey: string,
  options: TodoChipOptions = {},
): ReadonlyMap<string, readonly TodoCalendarChip[]> {
  const map = new Map<string, TodoCalendarChip[]>();

  for (const todo of todos) {
    if (!isTodoOnCalendar(todo, options)) continue;
    if (!todo.dueDate?.startsWith(monthKey)) continue;

    const chip = toTodoCalendarChip(todo, todayKey);
    const bucket = map.get(chip.dateKey);
    if (bucket) bucket.push(chip);
    else map.set(chip.dateKey, [chip]);
  }

  for (const bucket of map.values()) bucket.sort(compareTodoChips);
  return map;
}

/**
 * 이 할 일을 끌어서 다른 날에 놓아도 되는가.
 *
 * 일정과 달리 **반복 할 일도 옮길 수 있게 둔다.** 할 일의 반복은 "완료할 때 다음 회차를
 * 하나 만든다"는 방식이라(ManageTodos.toggleTodo), 지금 회차의 마감일을 미뤄도 이미 만들어진
 * 다른 회차가 함께 밀리지 않는다. 일정의 반복(규칙 하나가 여러 날을 만들어 냄)과는 구조가 다르다.
 */
export function canMoveTodoByDrag(todo: Todo): TodoDragCheck {
  if (todo.archivedAt) {
    return { ok: false, reason: '보관한 할 일은 달력에서 옮길 수 없습니다' };
  }
  if (!isDateKey(todo.dueDate)) {
    return { ok: false, reason: '마감일이 없는 할 일은 달력에서 옮길 수 없습니다' };
  }
  return { ok: true };
}

/** 마감일 이동 결과 — 그대로 `updateTodo` 에 넘길 수 있는 모양이다 */
export interface TodoDueDateMove {
  readonly dueDate: string;
  /** 시작일이 있던 할 일만 — 기간 길이를 유지한 채 함께 민다 */
  readonly startDate?: string;
}

/**
 * 마감일을 놓은 날짜로 옮긴다.
 *
 * **시작일이 있으면 같은 일수만큼 함께 민다.** 마감일만 당기면 시작일이 마감일보다
 * 뒤에 서는 뒤집힌 기간이 만들어지고, 할 일 화면의 타임라인·기간 표시가 그 자리에서 깨진다.
 *
 * 옮길 수 없거나 이동량이 0이면 `null` — 호출한 쪽은 아무것도 하지 않으면 된다.
 */
export function moveTodoDueDate(todo: Todo, dropDateKey: string): TodoDueDateMove | null {
  if (!canMoveTodoByDrag(todo).ok) return null;
  if (!isDateKey(dropDateKey)) return null;

  const from = todo.dueDate;
  if (from === undefined || from === dropDateKey) return null;

  const deltaDays = daysBetweenKeys(from, dropDateKey);
  if (deltaDays === 0) return null;

  if (isDateKey(todo.startDate)) {
    return { dueDate: dropDateKey, startDate: addDaysToKey(todo.startDate, deltaDays) };
  }
  return { dueDate: dropDateKey };
}

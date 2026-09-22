import type { Todo } from '@domain/entities/Todo';

/**
 * 저장 직전에 할 일마다 완료 시각(`completedAt`)을 맞춘다.
 *
 * - 완료가 아니면 비운다(완료 취소·아카이브 복원).
 * - 이미 완료 시각이 있으면 그대로 둔다(구글 할 일이 적어 준 시각 포함).
 * - 직전 저장본에서 **안 끝남 → 끝남**으로 바뀐 것만 `now` 를 찍는다.
 * - 직전 저장본에 이미 완료 시각이 있으면 이어 붙인다. 모바일처럼 메모리에 든 목록을
 *   통째로 저장하는 길은 저장소가 찍은 시각을 모른 채 저장하기 때문이다.
 * - 처음 보는 할 일이 완료 상태로 들어오거나, 이 칸이 생기기 전에 끝낸 일은 **비워 둔다.**
 *   언제 끝냈는지 모르는데 `now` 를 찍으면 옛날 일이 "이번 주에 끝낸 일"로 세어진다.
 *
 * 바뀐 것이 없으면 `next` 를 그대로 돌려준다.
 */
export function stampTodoCompletions(
  prev: readonly Todo[] | null,
  next: readonly Todo[],
  now: string,
): readonly Todo[] {
  const before = new Map((prev ?? []).map((t) => [t.id, t]));
  let changed = false;
  const stamped = next.map((todo) => {
    const result = stampOne(before.get(todo.id), todo, now);
    if (result !== todo) changed = true;
    return result;
  });
  return changed ? stamped : next;
}

function stampOne(before: Todo | undefined, todo: Todo, now: string): Todo {
  if (!todo.completed) {
    return todo.completedAt === undefined ? todo : { ...todo, completedAt: undefined };
  }
  if (todo.completedAt) return todo;
  if (!before) return todo;
  if (before.completed) {
    return before.completedAt ? { ...todo, completedAt: before.completedAt } : todo;
  }
  return { ...todo, completedAt: now };
}

/**
 * 구글 할 일에서 가져온 할 일의 완료 시각.
 *
 * - 원격이 완료가 아니면 없다.
 * - 쌤핀 쪽이 이미 완료 시각을 갖고 있으면 그것을 쓴다. 원격 시각은 쌤핀이 완료를 올린
 *   순간이라 실제로 끝낸 때보다 늦다.
 * - 아니면 원격이 적어 준 시각을 쓴다. 읽을 수 없으면 없음 — 저장소가 판단한다.
 */
export function completedAtFromRemote(
  remote: { readonly status: 'needsAction' | 'completed'; readonly completed?: string },
  local?: Pick<Todo, 'completed' | 'completedAt'>,
): string | undefined {
  if (remote.status !== 'completed') return undefined;
  if (local?.completed && local.completedAt) return local.completedAt;
  if (!remote.completed) return undefined;
  const time = Date.parse(remote.completed);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

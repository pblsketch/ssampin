/**
 * 구글에서 받은 자료인가 — 쌤핀 AI 로 보내지 않을 일정·할 일을 가른다 (ADR-136).
 *
 * ★왜 가르는가: 구글 규정은 캘린더·할 일 API 로 받은 자료를 **학습에 쓰는 곳으로 넘기는
 * 것**을 금지한다. 쌤핀 AI(업스테이지)는 무료 조건이라 보낸 내용이 학습에 쓰일 수 있으므로,
 * 구글에서 받은 일정·할 일은 원본은 물론 **개수도** 보내지 않는다 — 규정은 가공·집계한
 * 자료에도 똑같이 걸린다. 선생님 화면에는 앱이 직접 보여 준다.
 *
 * ★판정 기준 (오너 결정 D1·D2):
 * - 구글에서 가져온 항목
 * - 쌤핀에서 만들었어도 **구글 쪽에서 내용이 바뀌어 들어온** 항목(D1)
 * - 어디서 만들었는지 알 수 없는 옛 연결 항목(D2) — 모르면 구글 자료로 본다
 *
 * ★"내 AI"(선생님 구독)·AI 브릿지에는 이 규칙을 쓰지 않는다(ADR-136 결정 2).
 *
 * 순수 함수만 둔다 — domain 은 외부 의존성을 import 하지 않는다.
 */
import type { SchoolEvent } from '../entities/SchoolEvent';
import type { Todo } from '../entities/Todo';

type EventOrigin = Pick<SchoolEvent, 'source' | 'googleEventId' | 'googleContentReceived'>;
type TodoOrigin = Pick<Todo, 'origin' | 'googleTaskId'>;

export function isGoogleSourcedEvent(event: EventOrigin): boolean {
  if (event.source === 'google') return true;
  if (event.googleContentReceived === true) return true;
  // 출처 표시가 생기기 전의 연결 일정 — 쌤핀이 올린 것인지 구글에서 온 것인지 알 수 없다.
  return event.source === undefined && event.googleEventId !== undefined;
}

export function isGoogleSourcedTodo(todo: TodoOrigin): boolean {
  if (todo.origin === 'google') return true;
  if (todo.origin === 'ssampin') return false;
  // 표시가 생기기 전의 할 일(D2): 구글과 연결돼 있으면 어디서 만들었는지 알 수 없다.
  return todo.googleTaskId !== undefined;
}

/** 목록을 쌤핀 AI 로 보낼 것과 화면에만 둘 것으로 나눈다. 순서는 그대로 지킨다. */
export function splitGoogleSourced<T>(
  items: readonly T[],
  isGoogle: (item: T) => boolean,
): { readonly kept: readonly T[]; readonly google: readonly T[] } {
  const kept: T[] = [];
  const google: T[] = [];
  for (const item of items) (isGoogle(item) ? google : kept).push(item);
  return { kept, google };
}

function sameText(a: string | undefined, b: string | undefined): boolean {
  return (a ?? '').trim() === (b ?? '').trim();
}

type EventContent = Pick<
  SchoolEvent,
  'title' | 'description' | 'location' | 'date' | 'endDate' | 'startTime' | 'endTime'
>;

/**
 * 구글 쪽 수정이 일정의 **내용**을 바꿨는가.
 *
 * ★쌤핀이 올려 보낸 일정은 다음 동기화 때 그대로 되돌아온다(메아리). 그걸 "구글이
 * 고쳤다"고 보면 선생님이 만든 일정이 전부 쌤핀 AI 에서 사라진다. 그래서 되돌아온 것과
 * 원래 것을 **내용으로** 비교한다. 화면 표시용 `time` 문자열은 형식이 달라질 수 있어
 * 시작·끝 시각으로만 본다.
 */
export function eventContentDiffers(local: EventContent, incoming: EventContent): boolean {
  return (
    !sameText(local.title, incoming.title) ||
    !sameText(local.description, incoming.description) ||
    !sameText(local.location, incoming.location) ||
    local.date !== incoming.date ||
    (local.endDate ?? local.date) !== (incoming.endDate ?? incoming.date) ||
    (local.startTime ?? '') !== (incoming.startTime ?? '') ||
    (local.endTime ?? '') !== (incoming.endTime ?? '')
  );
}

type TodoContent = Pick<Todo, 'text' | 'notes' | 'dueDate' | 'completed'>;

/** 구글 쪽 수정이 할 일의 **내용**을 바꿨는가. 메아리는 바뀐 것이 아니다(위와 같은 이유). */
export function todoContentDiffers(local: TodoContent, merged: TodoContent): boolean {
  return (
    !sameText(local.text, merged.text) ||
    !sameText(local.notes, merged.notes) ||
    (local.dueDate ?? '') !== (merged.dueDate ?? '') ||
    local.completed !== merged.completed
  );
}

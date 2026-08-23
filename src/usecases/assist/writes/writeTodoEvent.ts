/**
 * 쌤핀 AI 쓰기 — 할 일(4) · 일정(3) 제안 만들기 (순수 함수)
 *
 * ★여기서 **저장하지 않는다.** 무엇을 저장할지 적은 종이 한 장을 만들 뿐이다.
 * 실제 저장은 선생님이 [실행]을 누를 때 어댑터가 기존 스토어 함수로 한다.
 *
 * 미리보기에는 **파싱된 값을 하나도 빠뜨리지 않고** 적는다. 감추면 [실행] 버튼이
 * 확인이 아니라 요식이 된다 — 잘못된 날짜를 그대로 통과시키는 자리가 정확히 거기다.
 */
import type { AssistWriteOutcome } from '@domain/entities/AssistWrite';

import type { WriteSources } from './writeSources';
import { bool, choice, date, int, matchOne, missing, text, time } from './writeArgs';
import type { RawArgs } from './writeArgs';

const PRIORITIES = ['high', 'medium', 'low', 'none'] as const;
const PRIORITY_LABEL: Readonly<Record<string, string>> = {
  high: '높음',
  medium: '보통',
  low: '낮음',
  none: '없음',
};

/** 값이 있는 줄만 미리보기에 담는다. 빈 줄은 읽는 데 방해만 된다. */
function fieldsOf(
  entries: readonly (readonly [string, string | undefined])[],
): { label: string; value: string }[] {
  return entries
    .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    .map(([label, value]) => ({ label, value }));
}

// ─────────────────────────────── 할 일 ───────────────────────────────

// 만들기는 기존 항목을 보지 않는다 — 그래서 `_src` 다. 표(WRITE_BUILDERS)가
// 모든 조립기를 같은 모양으로 부르므로 인자는 그대로 받아 둔다.
export function proposeCreateTodo(args: RawArgs, _src: WriteSources): AssistWriteOutcome {
  const body = text(args, 'text');
  if (body === undefined) return missing('할 일 내용');

  const due = date(args, 'dueDate');
  const at = time(args, 'time');
  const priority = choice(args, 'priority', PRIORITIES);

  return {
    tool: 'create_todo',
    action: 'create',
    title: '할 일 추가',
    fields: fieldsOf([
      ['내용', body],
      ['마감', due],
      ['시각', at],
      ['중요도', priority === undefined ? undefined : PRIORITY_LABEL[priority]],
    ]),
    values: {
      text: body,
      ...(due === undefined ? {} : { dueDate: due }),
      ...(at === undefined ? {} : { time: at }),
      ...(priority === undefined ? {} : { priority }),
    },
  };
}

export function proposeUpdateTodo(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 할 일인지');

  const found = matchOne(src.todos, query, (t) => t.text, '할 일');
  if (!found.ok) return { reason: found.reason };

  const body = text(args, 'text');
  const due = date(args, 'dueDate');
  const at = time(args, 'time');
  const priority = choice(args, 'priority', PRIORITIES);

  if (body === undefined && due === undefined && at === undefined && priority === undefined) {
    return { reason: '무엇을 바꿀지 알 수 없어서 아무것도 하지 않았어요.' };
  }

  return {
    tool: 'update_todo',
    action: 'update',
    title: '할 일 수정',
    target: { label: '지금', original: found.item.text },
    fields: fieldsOf([
      ['내용', body],
      ['마감', due],
      ['시각', at],
      ['중요도', priority === undefined ? undefined : PRIORITY_LABEL[priority]],
    ]),
    targetId: found.item.id,
    values: {
      ...(body === undefined ? {} : { text: body }),
      ...(due === undefined ? {} : { dueDate: due }),
      ...(at === undefined ? {} : { time: at }),
      ...(priority === undefined ? {} : { priority }),
    },
  };
}

export function proposeCompleteTodo(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 할 일인지');

  const found = matchOne(src.todos, query, (t) => t.text, '할 일');
  if (!found.ok) return { reason: found.reason };

  // 되돌리기(완료 해제)도 같은 도구로 한다 — 스토어가 toggle 하나뿐이라 두 정본이 안 생긴다.
  const undo = bool(args, 'undo') ?? false;
  if (found.item.completed && !undo) {
    return { reason: `"${found.item.text}"은(는) 이미 끝낸 걸로 돼 있어요.` };
  }
  if (!found.item.completed && undo) {
    return { reason: `"${found.item.text}"은(는) 아직 안 끝낸 걸로 돼 있어요.` };
  }

  return {
    tool: 'complete_todo',
    action: 'update',
    title: undo ? '할 일 되돌리기' : '할 일 완료',
    target: { label: '대상', original: found.item.text },
    fields: [{ label: '바꿀 상태', value: undo ? '아직 안 함' : '완료' }],
    targetId: found.item.id,
    values: { undo },
  };
}

export function proposeDeleteTodo(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 할 일인지');

  const found = matchOne(src.todos, query, (t) => t.text, '할 일');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'delete_todo',
    action: 'delete',
    title: '할 일 삭제',
    // ★지울 것의 원문을 그대로 보여준다(계획서 요구사항).
    target: { label: '지울 할 일', original: found.item.text },
    fields: fieldsOf([['마감', found.item.dueDate]]),
    targetId: found.item.id,
    values: {},
  };
}

// ─────────────────────────────── 일정 ───────────────────────────────

// 만들기는 기존 항목을 보지 않는다 — 그래서 `_src` 다. 표(WRITE_BUILDERS)가
// 모든 조립기를 같은 모양으로 부르므로 인자는 그대로 받아 둔다.
export function proposeCreateEvent(args: RawArgs, _src: WriteSources): AssistWriteOutcome {
  const title = text(args, 'title');
  if (title === undefined) return missing('일정 제목');
  const when = date(args, 'date');
  if (when === undefined) return missing('일정 날짜');

  const endDate = date(args, 'endDate');
  const at = time(args, 'time');
  const place = text(args, 'location');

  if (endDate !== undefined && endDate < when) {
    return { reason: '끝나는 날이 시작일보다 앞이라 만들지 않았어요.' };
  }

  return {
    tool: 'create_event',
    action: 'create',
    title: '일정 추가',
    fields: fieldsOf([
      ['제목', title],
      ['날짜', endDate === undefined ? when : `${when} ~ ${endDate}`],
      ['시각', at],
      ['장소', place],
    ]),
    values: {
      title,
      date: when,
      ...(endDate === undefined ? {} : { endDate }),
      ...(at === undefined ? {} : { time: at }),
      ...(place === undefined ? {} : { location: place }),
    },
  };
}

export function proposeUpdateEvent(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 일정인지');

  const found = matchOne(src.events, query, (e) => e.title, '일정');
  if (!found.ok) return { reason: found.reason };

  const title = text(args, 'title');
  const when = date(args, 'date');
  const at = time(args, 'time');
  const place = text(args, 'location');

  if (title === undefined && when === undefined && at === undefined && place === undefined) {
    return { reason: '무엇을 바꿀지 알 수 없어서 아무것도 하지 않았어요.' };
  }

  return {
    tool: 'update_event',
    action: 'update',
    title: '일정 수정',
    target: {
      label: '지금',
      original: `${found.item.date} ${found.item.title}`.trim(),
    },
    fields: fieldsOf([
      ['제목', title],
      ['날짜', when],
      ['시각', at],
      ['장소', place],
    ]),
    targetId: found.item.id,
    values: {
      ...(title === undefined ? {} : { title }),
      ...(when === undefined ? {} : { date: when }),
      ...(at === undefined ? {} : { time: at }),
      ...(place === undefined ? {} : { location: place }),
    },
  };
}

export function proposeDeleteEvent(args: RawArgs, src: WriteSources): AssistWriteOutcome {
  const query = text(args, 'match');
  if (query === undefined) return missing('어떤 일정인지');

  const found = matchOne(src.events, query, (e) => e.title, '일정');
  if (!found.ok) return { reason: found.reason };

  return {
    tool: 'delete_event',
    action: 'delete',
    title: '일정 삭제',
    target: {
      label: '지울 일정',
      original: `${found.item.date} ${found.item.title}`.trim(),
    },
    fields: fieldsOf([
      ['시각', found.item.time],
      ['장소', found.item.location],
    ]),
    targetId: found.item.id,
    values: {},
  };
}

/** 진도 교시 범위 — 0교시·99교시가 저장되는 것을 막는다. */
export const PERIOD_RANGE = { min: 1, max: 12 } as const;

/** 다른 파일(진도)에서도 쓰는 교시 파서 */
export function periodArg(args: RawArgs, key: string): number | undefined {
  return int(args, key, PERIOD_RANGE.min, PERIOD_RANGE.max);
}

export { fieldsOf };

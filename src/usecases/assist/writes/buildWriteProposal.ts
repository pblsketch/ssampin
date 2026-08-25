/**
 * 쌤핀 AI 쓰기 — 도구 이름 → 제안 (순수 함수, 단일 진입점)
 *
 * ★쓰기 경로는 **반드시 여기를 지난다.** 도구를 더할 때 표에 한 줄만 넣으면 되고,
 * 표에 없는 이름은 제안이 만들어지지 않는다(= 실행할 것이 없다). 모델이 지어낸 도구
 * 이름을 거르는 관문이 읽기 쪽 `findAssistTool` 이라면, 쓰기 쪽은 이 표다.
 *
 * ★모델 인자는 JSON 조차 깨져 올 수 있다. 여기서 통째로 방어한다 — 깨진 인자로 저장이
 * 일어나는 것보다 "무엇을 하려는지 못 알아들었다"고 말하는 편이 낫다.
 */
import type { AssistWriteOutcome } from '@domain/entities/AssistWrite';

import type { WriteSources } from './writeSources';
import type { RawArgs } from './writeArgs';
import {
  proposeCompleteTodo,
  proposeCreateEvent,
  proposeCreateTodo,
  proposeDeleteEvent,
  proposeDeleteTodo,
  proposeUpdateEvent,
  proposeUpdateTodo,
} from './writeTodoEvent';
import {
  proposeCreateMemo,
  proposeCreateProgress,
  proposeDeleteMemo,
  proposeDeleteProgress,
  proposeUpdateMemo,
  proposeUpdateProgress,
} from './writeMemoProgress';
import {
  proposeCreateBookmark,
  proposeCreateBookmarkGroup,
  proposeCreateNoteSection,
  proposeCreateNotePage,
  proposeCreateNotebook,
  proposeDeleteBookmark,
  proposeDeleteNotePage,
  proposeRenameNotePage,
  proposeUpdateBookmark,
} from './writeBookmarkNote';
import { proposeAddObservation, proposeSetAttendance, proposeSetRubricMark } from './writeStudent';

/**
 * ★세 번째 인자는 **선생님이 실제로 친 말**이다. 모델이 준 인자만 믿으면 안 되는 자리가
 * 있어서다 — 모델은 옆에 뜬 조회 카드의 "학급: 우리 반"을 베껴 반 이름으로 보내기도
 * 한다(2026-08-25 실측). 조립기는 선생님 말을 먼저 본다. 안 쓰는 조립기는 안 받으면 된다.
 */
type Builder = (args: RawArgs, src: WriteSources, question: string) => AssistWriteOutcome;

/**
 * 계획서 §2 C그룹의 22종(할일4 · 일정3 · 메모3 · 진도3 · 즐겨찾기4 · 노트5)
 * + 학생에게 닿는 쓰기 3종(출결·관찰·채점).
 *
 * ★출결·관찰·채점부터는 성격이 다르다 — 잘못 적히면 나이스·생활기록부까지 따라간다.
 * 그래서 조립기(`writeStudent.ts`)가 다른 곳보다 자주 거절하고, 실행기는 저장이
 * 막혔을 때(`null`) "적었어요"라고 말하지 않는다.
 */
export const WRITE_BUILDERS: Readonly<Record<string, Builder>> = {
  create_todo: proposeCreateTodo,
  update_todo: proposeUpdateTodo,
  complete_todo: proposeCompleteTodo,
  delete_todo: proposeDeleteTodo,

  create_event: proposeCreateEvent,
  update_event: proposeUpdateEvent,
  delete_event: proposeDeleteEvent,

  create_memo: proposeCreateMemo,
  update_memo: proposeUpdateMemo,
  delete_memo: proposeDeleteMemo,

  create_progress: proposeCreateProgress,
  update_progress: proposeUpdateProgress,
  delete_progress: proposeDeleteProgress,

  create_bookmark: proposeCreateBookmark,
  update_bookmark: proposeUpdateBookmark,
  delete_bookmark: proposeDeleteBookmark,
  create_bookmark_group: proposeCreateBookmarkGroup,

  create_notebook: proposeCreateNotebook,
  create_note_section: proposeCreateNoteSection,
  create_note_page: proposeCreateNotePage,
  rename_note_page: proposeRenameNotePage,
  delete_note_page: proposeDeleteNotePage,

  set_attendance: proposeSetAttendance,
  add_observation: proposeAddObservation,
  set_rubric_mark: proposeSetRubricMark,
};

/** 이 이름이 쓰기 도구인가. 스토어가 "실행할까 제안할까"를 가르는 데 쓴다. */
export function isWriteTool(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(WRITE_BUILDERS, name);
}

/** 등록된 쓰기 도구 이름 전부. 레지스트리 계약 테스트가 대조한다 */
export function writeToolNames(): readonly string[] {
  return Object.keys(WRITE_BUILDERS);
}

/**
 * 모델이 고른 쓰기 도구를 **제안으로** 바꾼다. 저장은 하지 않는다.
 *
 * @returns 제안, 또는 왜 못 만들었는지(한국어). 둘 중 하나는 반드시 나온다 —
 *   조용히 아무 일도 없는 것이 선생님에게는 가장 나쁘다.
 */
export function buildWriteProposal(
  name: string,
  rawArguments: string,
  src: WriteSources,
  /** 선생님이 친 말 그대로(가리기 전). 반 이름처럼 모델이 흘리는 값을 여기서 되찾는다 */
  question = '',
): AssistWriteOutcome {
  const build = WRITE_BUILDERS[name];
  if (!build) return { reason: '무엇을 하려는지 알아듣지 못했어요.' };

  let args: RawArgs = {};
  try {
    const parsed: unknown = JSON.parse(rawArguments.length > 0 ? rawArguments : '{}');
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      args = parsed as RawArgs;
    }
  } catch {
    // 인자가 깨졌다. 읽기와 달리 기본값으로 밀어붙이지 않는다 — 저장이 걸린 일이다.
    return { reason: '무엇을 저장할지 정확히 알아듣지 못해서 아무것도 하지 않았어요.' };
  }

  return build(args, src, question);
}

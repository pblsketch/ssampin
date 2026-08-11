/**
 * "지금 학기가 맞나요?"를 먼저 물어야 하는 때를 정하는 규칙.
 *
 * 개학일 설정을 만들어 두어도, **학기가 틀린 줄 모르는 선생님은 설정에 들어올 이유가 없다.**
 * 그래서 앱이 먼저 물어야 하는데, 아무 때나 물으면 잔소리가 된다.
 *
 * 물을 값어치가 있는 구간은 **8월**뿐이다. 학사 달력은 8월부터 2학기로 보지만(대부분 8월 중순
 * 개학) 8월 말까지 1학기인 학교도 있어서, 8월은 **앱이 어느 쪽인지 확신할 수 없는 유일한 달**이다.
 * 3월이나 10월에는 달력과 학교가 갈릴 일이 없으니 묻지 않는다.
 *
 * ⚠️ 이건 ADR-037이 금지한 "시즌 배너"가 아니다. 금지 대상은 앱이 **날짜로 학사 구간을 단정**하는
 * 것이고, 여기서는 반대로 **모른다는 사실을 인정하고 사용자에게 묻는다.** 답을 들으면 다시 묻지
 * 않는다(개학일이 등록되거나 사용자가 넘기면 조용해진다).
 */

import { parseTerm } from './academicCalendar';

export interface TermStartPromptInput {
  /** 오늘 날짜('YYYY-MM-DD'). */
  readonly todayIso: string;
  /** 지금 앱이 아는 학기(resolveCurrentTerm 결과). */
  readonly currentTerm: string;
  /** 등록된 학기별 개학일 — 이미 답한 학기는 묻지 않는다. */
  readonly termStartDates?: Readonly<Record<string, string>>;
  /** 사용자가 "나중에"로 넘긴 학기 라벨 — 같은 학기를 다시 묻지 않는다. */
  readonly skippedTerm?: string;
}

export type TermStartPromptDecision =
  | { readonly kind: 'none' }
  /** 그 학기의 개학일을 물어본다. */
  | { readonly kind: 'ask'; readonly term: string };

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 8월에 접속했는데 이번 2학기 개학일을 아직 모른다면 한 번 물어본다.
 *
 * 묻지 않는 경우:
 *  - 8월이 아니다 — 달력과 학교가 갈릴 일이 없는 달이다.
 *  - 그 학기 개학일이 이미 등록돼 있다 — 답을 들었다.
 *  - 사용자가 이미 넘겼다 — 같은 학기에 다시 묻지 않는다.
 */
export function decideTermStartPrompt(input: TermStartPromptInput): TermStartPromptDecision {
  const m = ISO_DATE_RE.exec(input.todayIso);
  if (m === null) return { kind: 'none' };
  if (Number(m[2]) !== 8) return { kind: 'none' };

  const parsed = parseTerm(input.currentTerm);
  if (parsed === null) return { kind: 'none' };

  // 8월이면 학사 달력상 그 해 2학기다. currentTerm이 무엇이든 물어볼 대상은 이 학기다.
  const term = `${Number(m[1])}-2`;

  if (input.termStartDates?.[term] !== undefined) return { kind: 'none' };
  if (input.skippedTerm === term) return { kind: 'none' };

  return { kind: 'ask', term };
}

/**
 * 시간표 조회 결과로 "2학기가 시작된 것 같다"를 감지하는 규칙.
 *
 * 앱은 개학일을 모른다(ADR-037). 그런데 **학교 자신이 답을 갖고 있다** — 8월 중순에 2학기를
 * 개학한 학교의 나이스에는 그 주 수업이 2학기로 등록돼 있다. `fetchNeisTimetableWithSemesterFallback`은
 * 달력에서 파생한 학기로 먼저 조회하고 비면 반대 학기로 재시도하는데, **그 재시도가 성공했다는
 * 사실 자체**가 "달력은 1학기라는데 학교 데이터는 2학기"라는 학교의 증언이다.
 *
 * 그래서 이 규칙은 날짜로 단정하지 않는다 — 학교 데이터가 말한 것을 사용자에게 **확인만 받는다**.
 * 확인 전에는 아무것도 바꾸지 않는다.
 *
 * ⚠️ 재시도 성공(usedFallbackSemester)을 반드시 요구하는 이유: 첫 조회가 그냥 성공한 경우는
 * 달력과 학교가 일치한다는 뜻이라 증언이 아니다. 예를 들어 6월에 9월 주간을 미리 조회하면 축이
 * 처음부터 2학기로 잡혀 성공하는데, 그건 개학 신호가 아니라 그냥 미래를 본 것이다.
 */

import { parseTerm } from './academicCalendar';
import { compareTerms } from './schoolTermStart';

/** 감지에 필요한 입력. */
export interface TermSignalInput {
  /** 지금 앱이 아는 학기(resolveCurrentTerm 결과). */
  readonly currentTerm: string;
  /** 나이스가 실제로 결과를 준 학기 라벨('2026-2'). */
  readonly observedTerm: string;
  /** 반대 학기 재시도로 얻은 결과인지 — false면 증언이 아니다. */
  readonly usedFallbackSemester: boolean;
  /** 결과를 얻은 조회 기간의 시작일('YYYY-MM-DD') — 개학일 제안값. */
  readonly observedWeekStartIso: string;
  /** 이미 등록된 학기별 개학일 — 등록돼 있으면 다시 묻지 않는다. */
  readonly termStartDates?: Readonly<Record<string, string>>;
}

export type TermSignalDecision =
  /** 물을 것이 없다 */
  | { readonly kind: 'none' }
  /** "이 날짜부터 이 학기로 맞출까요?"를 묻는다 */
  | { readonly kind: 'suggest'; readonly term: string; readonly startIso: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 시간표 조회 결과가 학기 전진을 증언하는지 판정한다.
 *
 * 묻는 조건(전부 만족):
 *  1. 반대 학기 재시도로 얻은 결과다 — 달력과 학교가 어긋났다는 증거.
 *  2. 관찰된 학기가 앱이 아는 학기보다 **뒤**다 — 뒤로 가는 제안은 하지 않는다.
 *  3. 같은 학년도다 — 학년도가 다르면 사용자가 지난/다음 해를 조회한 것이지 개학이 아니다.
 *  4. 그 학기 개학일이 아직 등록돼 있지 않다 — 이미 답한 사람에게 다시 묻지 않는다.
 */
export function decideTermSignal(input: TermSignalInput): TermSignalDecision {
  if (!input.usedFallbackSemester) return { kind: 'none' };
  if (!ISO_DATE_RE.test(input.observedWeekStartIso)) return { kind: 'none' };

  const observed = parseTerm(input.observedTerm);
  const current = parseTerm(input.currentTerm);
  if (observed === null || current === null) return { kind: 'none' };
  if (observed.year !== current.year) return { kind: 'none' };
  if (compareTerms(input.observedTerm, input.currentTerm) <= 0) return { kind: 'none' };
  if (input.termStartDates?.[input.observedTerm] !== undefined) return { kind: 'none' };

  return { kind: 'suggest', term: input.observedTerm, startIso: input.observedWeekStartIso };
}

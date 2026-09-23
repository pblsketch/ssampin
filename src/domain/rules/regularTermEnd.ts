/**
 * 관찰 기록 응원 2·3차(ADR-137) — 학기마다 '정규 수업 종료일'.
 *
 * 정하는 순서:
 *  1. 설정에 등록된 학기 종료일(`termEndDates` — 설정 화면의 '마지막 수업일')
 *  2. 학사일정의 방학식·종업식 후보(`findTermEndCandidates` 그대로 — 같은 학기에 여럿이면 가장
 *     이른 날. 1학기는 7월, 2학기는 12~2월)
 *  3. 둘 다 없으면 null — 학기 돌아보기를 알리지 않는다.
 *
 * 겨울방학 두 형태(2월까지 이어지는 학교 / 방학 뒤 잠깐 등교했다가 봄방학하는 학교) 모두 2학기
 * 종료일은 **겨울방학 직전**이다 — 가장 이른 겨울방학식이 종업식보다 앞이기 때문이다.
 * 그 뒤 학기 마지막 날까지(`TermTail`)에 시작하는 주는 쉬는 주로 본다(spec §0).
 */
import type { TermTail } from './schoolCalendarDays';
import { findTermEndCandidates, type ScheduleEventLike } from './termEndFromSchedule';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRegularTermEnd(
  term: string,
  termEndDates: Readonly<Record<string, string>> | undefined,
  events: readonly ScheduleEventLike[],
): string | null {
  const registered = termEndDates?.[term];
  if (typeof registered === 'string' && DATE_RE.test(registered)) return registered;
  return findTermEndCandidates(events, [term])[0]?.endIso ?? null;
}

/**
 * 학기마다 종료일 뒤 구간. 종료일을 모르는 학기, 학기 마지막 날을 모르는 학기는 뺀다.
 * @param terms 살펴볼 학기와 그 학기 마지막 날(다음 학기 시작 전날)
 */
export function buildTermTails(
  terms: readonly { readonly term: string; readonly lastDay: string | null }[],
  termEndDates: Readonly<Record<string, string>> | undefined,
  events: readonly ScheduleEventLike[],
): TermTail[] {
  const tails: TermTail[] = [];
  for (const { term, lastDay } of terms) {
    if (lastDay === null || !DATE_RE.test(lastDay)) continue;
    const end = resolveRegularTermEnd(term, termEndDates, events);
    if (end === null || end >= lastDay) continue;
    tails.push({ after: end, until: lastDay });
  }
  return tails;
}

/**
 * 진도 동시 기록(팬아웃) 규칙 — 한 반에 진도를 넣을 때, 같이 기록할 다른 반의
 * "언제·몇 교시"를 결정하는 순수 로직.
 *
 * 반마다 시간표가 다르므로 원본의 날짜·교시를 그대로 복사하면 거의 항상 틀린다.
 * 그래서 대상 반의 시간표를 보고 배정한다:
 *   1) 같은 날 같은 교시에 그 반 수업이 있으면 → 그대로
 *   2) 같은 날 다른 교시에 있으면 → 그 교시
 *   3) 그 날 수업이 없으면 → 가장 가까운 다음 수업
 *   4) 이미 진도가 들어있는 자리는 건너뛰고 그 다음 후보를 찾는다
 *      (연속으로 여러 건을 넣을 때 자연스럽게 다음 수업으로 이어지도록)
 *   5) 검색 기간 안에 빈 수업 자리가 하나도 없으면 배정 실패(중복)로 보고한다
 *
 * Clean Architecture: 외부 의존성 0. 시간표 조회·중복 판정은 호출자가 콜백으로 주입한다.
 */

import { isSubjectMatch } from './matchingRules';
import { isTeachingClassArchived } from './teachingClassArchive';
import type { TeachingClass } from '@domain/entities/TeachingClass';

export type FanoutPlacementKind =
  /** 같은 날 같은 교시에 대상 반 수업이 있음 */
  | 'same-slot'
  /** 같은 날이지만 다른 교시 */
  | 'same-day'
  /** 다음 수업일로 밀림 */
  | 'next-lesson'
  /** 시간표 매칭이 전혀 없어 원본 날짜·교시를 그대로 사용 */
  | 'no-timetable';

export type FanoutPlacement =
  | {
      readonly ok: true;
      readonly date: string;
      readonly period: number;
      readonly kind: FanoutPlacementKind;
    }
  | { readonly ok: false; readonly reason: 'duplicate' };

export interface FanoutPlacementInput {
  /** 원본 진도의 날짜 (YYYY-MM-DD) */
  readonly anchorDate: string;
  /** 원본 진도의 교시 (1-based) */
  readonly anchorPeriod: number;
  /** 대상 반이 그 날짜에 수업이 있는 교시들 (1-based, 없으면 빈 배열) */
  readonly lessonPeriodsOn: (date: string) => readonly number[];
  /** 대상 반의 해당 날짜·교시에 이미 진도가 있는지 */
  readonly isOccupied: (date: string, period: number) => boolean;
  /** 다음 수업을 찾을 때 며칠까지 볼지 (기본 21일) */
  readonly searchDays?: number;
}

const DEFAULT_SEARCH_DAYS = 21;

/** YYYY-MM-DD 문자열에 일수를 더한다 (로컬 자정 기준 — 시간대 밀림 방지) */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** 오름차순 정렬 + 중복 제거 */
function normalizePeriods(periods: readonly number[]): readonly number[] {
  return [...new Set(periods)].sort((a, b) => a - b);
}

/**
 * 대상 반 한 곳에 대한 배정 결과를 계산한다.
 *
 * 검색 기간 안에 수업 자리 자체가 하나도 없으면(시간표 미등록 등) 원본 날짜·교시를
 * 그대로 쓰되, 그 자리마저 이미 차 있으면 중복으로 보고한다.
 */
export function resolveFanoutPlacement(input: FanoutPlacementInput): FanoutPlacement {
  const searchDays = input.searchDays ?? DEFAULT_SEARCH_DAYS;
  if (!input.anchorDate) return { ok: false, reason: 'duplicate' };

  let sawAnyLessonSlot = false;

  for (let offset = 0; offset <= searchDays; offset++) {
    const date = offset === 0 ? input.anchorDate : addDays(input.anchorDate, offset);
    const periods = normalizePeriods(input.lessonPeriodsOn(date));
    if (periods.length === 0) continue;
    sawAnyLessonSlot = true;

    // 첫날에는 원본과 같은 교시를 최우선으로 시도한다
    const ordered =
      offset === 0 && periods.includes(input.anchorPeriod)
        ? [input.anchorPeriod, ...periods.filter((p) => p !== input.anchorPeriod)]
        : periods;

    for (const period of ordered) {
      if (input.isOccupied(date, period)) continue;
      const kind: FanoutPlacementKind =
        offset > 0 ? 'next-lesson' : period === input.anchorPeriod ? 'same-slot' : 'same-day';
      return { ok: true, date, period, kind };
    }
  }

  // 시간표에서 이 반 수업을 한 번도 못 찾은 경우 — 원본 자리를 그대로 쓴다
  if (!sawAnyLessonSlot && !input.isOccupied(input.anchorDate, input.anchorPeriod)) {
    return {
      ok: true,
      date: input.anchorDate,
      period: input.anchorPeriod,
      kind: 'no-timetable',
    };
  }

  return { ok: false, reason: 'duplicate' };
}

/* ─────────── 후보 반 목록 · 결과 요약 (데스크톱·모바일 공용) ─────────── */

/** "함께 기록할 반" 후보 한 줄 */
export interface FanoutCandidate {
  readonly classId: string;
  readonly name: string;
  readonly subject: string;
  /** 원본 반과 같은 과목인지 — 목록 상단 배치용 */
  readonly sameSubject: boolean;
}

/** 저장 전 미리보기 한 줄 (후보 + 배정 결과) */
export interface FanoutPreviewRow extends FanoutCandidate {
  readonly placement: FanoutPlacement;
}

export interface FanoutApplyResult {
  /** 실제로 추가된 항목 수 */
  readonly added: number;
  /** 이미 같은 자리에 진도가 있어 건너뛴 반 수 */
  readonly skipped: number;
  /** 원본과 다른 날짜/교시로 옮겨 배정된 반 수 */
  readonly shifted: number;
}

/**
 * 함께 기록할 수 있는 반 후보를 만든다.
 * 원본 반과 보관된 반은 제외하고, 같은 과목을 앞에 둔다(그 안에서는 입력 순서 유지).
 */
export function buildFanoutCandidates(
  classes: readonly TeachingClass[],
  sourceClassId: string | null,
): readonly FanoutCandidate[] {
  if (!sourceClassId) return [];
  const source = classes.find((c) => c.id === sourceClassId);
  if (!source) return [];
  const rows = classes
    .filter((c) => c.id !== sourceClassId && !isTeachingClassArchived(c))
    .map((c) => ({
      classId: c.id,
      name: c.name,
      subject: c.subject,
      sameSubject: isSubjectMatch(c.subject, source.subject),
    }));
  return [...rows.filter((r) => r.sameSubject), ...rows.filter((r) => !r.sameSubject)];
}

/** 팬아웃 결과를 사용자용 한 줄 안내로 만든다 (알릴 내용이 없으면 null) */
export function describeFanoutResult(result: FanoutApplyResult): string | null {
  if (result.added === 0 && result.skipped === 0) return null;
  const parts: string[] = [];
  if (result.added > 0) {
    parts.push(
      result.shifted > 0
        ? `다른 ${result.added}개 반에도 기록했습니다 (${result.shifted}개 반은 그 반 수업 시간에 맞춰 배정)`
        : `다른 ${result.added}개 반에도 기록했습니다`,
    );
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped}개 반은 이미 진도가 있어 건너뛰었습니다`);
  }
  return parts.join(' · ');
}

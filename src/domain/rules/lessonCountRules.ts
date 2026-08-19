/**
 * 학기 총 수업 차시 **추정**과 다음 수업일 찾기.
 *
 * ## 이 숫자는 확정이 아니다
 *
 * 세 가지 이유로 틀릴 수 있고, 그 사실이 결과에 담겨 화면까지 가야 한다.
 *
 *  1. **미래에는 변동 시간표가 없다.** 결·보강은 그때그때 등록되므로, 오늘 이후 구간은
 *     기본 시간표 기준 예상이다(`hasFutureEstimate`).
 *  2. **시간표 매칭이 느슨할 수 있다.** 교실명 부분 일치(2단계)나 담임반 폴백(3단계)로 들어온
 *     날은 다른 반 수업일 수 있다 — 그래서 날짜마다 `matchStage`를 함께 돌려준다.
 *  3. **학사일정만으로는 갈리지 않는 날이 있다.** 시험기간·행사는 자동으로 빼지 않고 표시만
 *     한다(`notices`). 뺄지 말지는 사용자가 정한다.
 *
 * 그래서 이 함수는 **뺀 날 목록(`excludedDays`)과 넣은 날 목록(`lessonDays`)을 둘 다** 돌려준다.
 * 뺀 날만 보여 주면 과대 추정 쪽 오차를 사용자가 확인할 방법이 없다.
 *
 * ## 시간표를 모르면 0이 아니라 "모른다"
 *
 * 교사 시간표를 등록하지 않은 선생님(나이스에 시간표를 안 올린 학교·비담임 교과교사)은
 * 매칭이 전 구간 0건이 된다. 그때 "예상 0차시"를 보여 주면 고장으로 읽힌다. 그래서 숫자가
 * 아니라 `status: 'noTimetable'`을 돌려주고, 화면은 시간표 등록을 안내한다.
 *
 * Clean Architecture: 외부 의존 0 — `@domain/*`만 참조한다.
 */

import {
  classifyLessonDayExclusion,
  collectLessonDayNotices,
  type LessonDayEvent,
  type LessonDayExclusion,
  type LessonDayNotice,
} from './lessonDayExclusion';
import type { LessonDayEntry, LessonDayIndexUnavailable } from './buildLessonDayIndex';
import type { ProgressMatchStage } from './progressMatching';

/** 사용자 정정 — 반·날짜 단위. */
export type LessonDayAdjustmentKind = 'hasLesson' | 'noLesson';

/** 판정에 필요한 그날의 부가 정보. 전부 호출자가 미리 인덱싱해 넣는다. */
export interface LessonDayContext {
  /** 날짜 → 공휴일 이름. */
  readonly holidayNameByDate?: ReadonlyMap<string, string>;
  /** 날짜 → 학사일정(분류 포함). */
  readonly eventsByDate?: ReadonlyMap<string, readonly LessonDayEvent[]>;
  /** 날짜 → 사용자 정정. */
  readonly adjustmentByDate?: ReadonlyMap<string, LessonDayAdjustmentKind>;
}

export interface LessonCountInput extends LessonDayContext {
  /** `buildLessonDayIndex` 결과 — 시간표가 수업을 주는 날만 들어 있다. */
  readonly lessonDayIndex: ReadonlyMap<string, LessonDayEntry>;
  /** 오늘 'YYYY-MM-DD' — 지난 수업과 남은 수업을 가르는 기준. */
  readonly todayIso: string;
  /**
   * 색인이 비어 있는 이유(`buildLessonDayIndexResult`가 준 값).
   *
   * 넘기지 않으면 빈 색인을 전부 '시간표 미등록'으로 본다 — 보관한 반을 열었을 뿐인
   * 선생님에게 "시간표를 먼저 등록해 주세요"가 뜨는 오진이 생기므로, 화면은 반드시
   * 이 값을 함께 넘겨야 한다.
   */
  readonly indexUnavailable?: LessonDayIndexUnavailable | null;
}

export interface LessonDayDetail {
  readonly date: string;
  readonly periods: readonly number[];
  readonly matchStage: ProgressMatchStage;
  /** 자동 제외는 안 됐지만 확인해 볼 값이 있는 표시(시험·행사). */
  readonly notices: readonly LessonDayNotice[];
}

export interface ExcludedDayDetail {
  readonly date: string;
  /** 되살렸을 때 살아날 교시들 — 사용자가 "수업했어요"를 누르면 이만큼 늘어난다. */
  readonly periods: readonly number[];
  readonly exclusion: LessonDayExclusion;
  readonly notices: readonly LessonDayNotice[];
}

/**
 * 숫자를 보여 줄 수 있는 상태인가, 아니면 무엇을 안내해야 하는가.
 *
 * `ok`가 아니면 **숫자를 보여 주지 않는다.** 특히 0차시를 그대로 내보내면 고장으로 읽힌다.
 * 상태마다 사용자가 할 행동이 다르므로 하나로 뭉치지 않는다:
 *  - `noTimetable` — 시간표를 먼저 등록해 주세요
 *  - `archivedClass` — 보관된 반입니다 (안내만, 등록 유도 금지)
 *  - `invalidTerm` — 학기 시작·종료일을 확인해 주세요
 *  - `classNotFound` — 반을 찾을 수 없습니다 (삭제된 반을 보고 있는 상태)
 */
export type LessonCountStatus =
  | 'ok'
  | 'noTimetable'
  | 'archivedClass'
  | 'invalidTerm'
  | 'classNotFound';

export interface LessonCountEstimate {
  readonly status: LessonCountStatus;
  /** 학기 전체 교시 수 합계(제외한 날 빼고). */
  readonly totalPeriods: number;
  /** 오늘까지의 교시 수 합계. */
  readonly pastPeriods: number;
  /** 내일부터의 교시 수 합계. */
  readonly remainingPeriods: number;
  /** 수업일 상세 — 날짜순. */
  readonly lessonDays: readonly LessonDayDetail[];
  /** 뺀 날 상세 — 날짜순. */
  readonly excludedDays: readonly ExcludedDayDetail[];
  /**
   * 오늘 이후 구간이 포함돼 있는가. true면 그 구간은 변동 시간표가 반영되지 않은 예상이다.
   * 화면은 이때 "예상" 표기를 반드시 붙인다.
   */
  readonly hasFutureEstimate: boolean;
}

function emptyEstimate(status: LessonCountStatus): LessonCountEstimate {
  return { ...EMPTY_BASE, status };
}

const EMPTY_BASE = {
  status: 'noTimetable' as LessonCountStatus,
  totalPeriods: 0,
  pastPeriods: 0,
  remainingPeriods: 0,
  lessonDays: [],
  excludedDays: [],
  hasFutureEstimate: false,
} satisfies LessonCountEstimate;

/** 그날이 최종적으로 수업일인지 판정하고, 아니면 사유를 준다. */
function verdictFor(
  date: string,
  entry: LessonDayEntry,
  ctx: LessonDayContext,
): { exclusion: LessonDayExclusion | null; notices: readonly LessonDayNotice[] } {
  const events = ctx.eventsByDate?.get(date);
  const exclusion = classifyLessonDayExclusion({
    date,
    adjustment: ctx.adjustmentByDate?.get(date),
    holidayName: ctx.holidayNameByDate?.get(date) ?? null,
    events,
    scheduledPeriodCount: entry.periods.length,
  });
  return { exclusion, notices: collectLessonDayNotices(events) };
}

/**
 * 학기 총 차시 추정.
 *
 * 시간표가 수업을 주는 날만 훑는다 — 주말이나 원래 공강인 날을 "뺀 날"로 늘어놓으면 목록이
 * 소음으로 가득 차 정작 확인해야 할 날이 묻힌다.
 *
 * 결정론적이다: 같은 입력이면 언제 호출해도 같은 결과가 나온다(오늘 날짜도 인자로 받는다).
 */
export function estimateLessonCount(input: LessonCountInput): LessonCountEstimate {
  if (input.indexUnavailable != null) return emptyEstimate(input.indexUnavailable);
  if (input.lessonDayIndex.size === 0) return emptyEstimate('noTimetable');

  const lessonDays: LessonDayDetail[] = [];
  const excludedDays: ExcludedDayDetail[] = [];
  let totalPeriods = 0;
  let pastPeriods = 0;
  let hasFutureEstimate = false;

  const dates = [...input.lessonDayIndex.keys()].sort();

  for (const date of dates) {
    const entry = input.lessonDayIndex.get(date);
    if (entry === undefined) continue;

    const { exclusion, notices } = verdictFor(date, entry, input);

    if (exclusion !== null) {
      excludedDays.push({ date, periods: entry.periods, exclusion, notices });
      continue;
    }

    const count = entry.periods.length;
    totalPeriods += count;
    if (date <= input.todayIso) {
      pastPeriods += count;
    } else {
      hasFutureEstimate = true;
    }

    lessonDays.push({ date, periods: entry.periods, matchStage: entry.matchStage, notices });
  }

  return {
    status: 'ok',
    totalPeriods,
    pastPeriods,
    remainingPeriods: totalPeriods - pastPeriods,
    lessonDays,
    excludedDays,
    hasFutureEstimate,
  };
}

export interface NextLessonDateInput extends LessonDayContext {
  /** 기준 날짜 'YYYY-MM-DD'. 이 날은 결과에 포함하지 않는다. */
  readonly fromIso: string;
  readonly lessonDayIndex: ReadonlyMap<string, LessonDayEntry>;
  /** 'forward'(기본) = 다음 수업일, 'backward' = 이전 수업일. */
  readonly direction?: 'forward' | 'backward';
  /** 며칠까지 찾아볼지. 기본 60일. */
  readonly maxDays?: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_MAX_DAYS = 60;

function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 기준 날짜의 다음(또는 이전) 수업일. 없으면 `null`.
 *
 * 수업 없는 요일·공휴일·방학·사용자가 "수업 없었어요"로 표시한 날을 모두 건너뛴다.
 * 정해진 기간 안에 수업일이 없으면 `null`을 돌려주고, 화면은 이동하지 않고 안내만 한다 —
 * 학기 끝이나 긴 방학에 걸린 경우라 억지로 옮기면 엉뚱한 날짜로 튄다.
 */
export function findNextLessonDate(input: NextLessonDateInput): string | null {
  if (!ISO_DATE_RE.test(input.fromIso)) return null;

  const step = input.direction === 'backward' ? -1 : 1;
  const limit = Math.max(1, Math.trunc(input.maxDays ?? DEFAULT_MAX_DAYS));

  let cursor = input.fromIso;
  for (let i = 0; i < limit; i += 1) {
    cursor = shift(cursor, step);
    const entry = input.lessonDayIndex.get(cursor);
    if (entry === undefined) continue;
    const { exclusion } = verdictFor(cursor, entry, input);
    if (exclusion === null) return cursor;
  }

  return null;
}

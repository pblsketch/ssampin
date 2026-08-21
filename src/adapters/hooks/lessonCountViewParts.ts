/**
 * 차시 계산에 필요한 **재료 가공**을 한곳에 모은 순수 함수들.
 *
 * PC(`useLessonCountEstimate`)와 모바일(`useMobileLessonCountEstimate`)이 같은 숫자를 내놓아야
 * 한다. 두 화면이 각자 공휴일 지도를 만들고 학사일정을 분류하면, 한쪽만 고쳤을 때 **같은 반의
 * 차시가 기기마다 달라진다.** 그 어긋남은 사용자가 알아채기 어렵고, 알아채면 앱 전체를 못 믿게 된다.
 *
 * 그래서 스토어에서 값을 꺼내는 일만 각 훅이 하고, 꺼낸 값을 계산 입력으로 바꾸는 일은 전부
 * 여기서 한다. React에 의존하지 않으므로 렌더 없이 검증할 수 있다.
 */

import { classifyNeisEvent } from '@domain/entities/NeisSchedule';
import { getKoreanHolidays, getHolidayName } from '@domain/rules/holidayRules';
import type { LessonDayEvent } from '@domain/rules/lessonDayExclusion';
import type { LessonDayAdjustmentKind, LessonCountEstimate } from '@domain/rules/lessonCountRules';
import type { LessonDayAdjustment } from '@domain/entities/CurriculumProgress';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';

export interface LessonCountView extends LessonCountEstimate {
  /** 학기 종료일이 아직 없어 계산을 시작조차 못 한 상태. 화면은 종료일을 묻는다. */
  readonly needsTermEnd: boolean;
  /** 학기 라벨('2026-2') — 화면 문구에 쓴다. */
  readonly term: string;
  /**
   * 등록된 학기 마지막 수업일 'YYYY-MM-DD' — 아직 없으면 `null`.
   *
   * 화면이 "언제까지로 세고 있는지"를 보여주고 고칠 수 있게 하려면 이 값이 필요하다. 화면이
   * 설정에서 따로 꺼내면 계산에 쓴 날짜와 화면에 쓴 날짜가 갈릴 수 있어 여기에 실어 보낸다.
   */
  readonly termEndIso: string | null;
}

/** 'YYYY-MM-DD'에서 연도만. 형식이 아니면 null. */
function yearOf(iso: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso);
  return m === null ? null : Number(m[1]);
}

/**
 * 수업일 날짜들에 대해서만 공휴일 이름을 찾는다.
 *
 * 학기가 걸친 연도만 계산한다 — 공휴일 표는 연 단위로 만들어지므로, 필요 없는 해까지 만들면
 * 그만큼 헛일이다.
 */
export function buildHolidayMap(dates: Iterable<string>): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  const list = [...dates];
  const years = new Set<number>();
  for (const iso of list) {
    const y = yearOf(iso);
    if (y !== null) years.add(y);
  }
  for (const y of years) {
    const holidays = getKoreanHolidays(y);
    for (const iso of list) {
      if (yearOf(iso) !== y) continue;
      const name = getHolidayName(iso, holidays);
      if (name !== null) map.set(iso, name);
    }
  }
  return map;
}

/**
 * 날짜별 학사일정 — 분류(`classifyNeisEvent`)를 붙여서 넘긴다.
 *
 * 숨김 처리한 일정은 뺀다. 사용자가 화면에서 지운 행사가 계산에는 남아 있으면,
 * 왜 그 날이 빠졌는지 근거 목록에서 찾을 수 없다.
 */
export function buildEventMap(
  events: readonly SchoolEvent[],
): ReadonlyMap<string, readonly LessonDayEvent[]> {
  const map = new Map<string, LessonDayEvent[]>();
  for (const e of events) {
    if (e.isHidden === true) continue;
    const title = e.neis?.eventName ?? e.title;
    const group = classifyNeisEvent({ title, subtractDayType: e.neis?.subtractDayType ?? '' });
    const list = map.get(e.date);
    if (list === undefined) map.set(e.date, [{ title, group }]);
    else list.push({ title, group });
  }
  return map;
}

/** 그 반의 정정만 날짜 → 종류로. 정정은 반 단위라 다른 반 것이 섞이면 안 된다. */
export function buildAdjustmentMap(
  adjustments: readonly LessonDayAdjustment[],
  classId: string,
): ReadonlyMap<string, LessonDayAdjustmentKind> {
  const map = new Map<string, LessonDayAdjustmentKind>();
  for (const a of adjustments) {
    if (a.classId === classId) map.set(a.date, a.kind);
  }
  return map;
}

/**
 * 학기 종료일을 아직 모르는 상태의 결과.
 *
 * 숫자를 0으로 채워 돌려주지만 `needsTermEnd`가 켜져 있으므로 **화면은 숫자를 보여주지 않는다.**
 * "예상 0차시"는 고장으로 읽힌다.
 */
export function termEndUnknownView(term: string): LessonCountView {
  return {
    status: 'noTimetable',
    totalPeriods: 0,
    pastPeriods: 0,
    remainingPeriods: 0,
    lessonDays: [],
    excludedDays: [],
    hasFutureEstimate: false,
    needsTermEnd: true,
    term,
    termEndIso: null,
  };
}

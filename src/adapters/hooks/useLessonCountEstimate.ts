/**
 * 진도 화면에 "이번 학기 예상 몇 차시"를 공급하는 훅.
 *
 * 계산 자체는 전부 도메인 순수 함수가 한다(`buildLessonDayIndexResult` → `estimateLessonCount`).
 * 이 훅은 **스토어에서 재료를 모아 넘기는 얇은 층**이다. 계산을 여기 두면 정확도도 성능도
 * 단위 테스트로 잡을 수 없어서 일부러 도메인으로 내렸다.
 *
 * ## 다시 계산하는 시점을 좁게 잡는다
 *
 * 학기 색인(`lessonDayIndex`)은 시간표·변동·학기 구간·반 목록이 바뀔 때만 다시 만든다.
 * **진도 기록은 의존성에 넣지 않는다** — 수업 한 건 적을 때마다 학기 100일을 다시 훑으면
 * 입력이 버벅인다. 진도와의 결합은 이 훅 밖에서 가볍게 한다.
 *
 * 반대로 공휴일·학사일정·사용자 정정은 결과를 바꾸므로 두 번째 `useMemo`의 의존성에 넣되,
 * 그 단계는 색인을 다시 만들지 않고 이미 만들어진 날짜만 훑는다.
 */

import { useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTermRange } from './useTermRange';
import { buildLessonDayIndexResult } from '@domain/rules/buildLessonDayIndex';
import { estimateLessonCount, type LessonCountEstimate } from '@domain/rules/lessonCountRules';
import type { LessonDayEvent } from '@domain/rules/lessonDayExclusion';
import type { LessonDayAdjustmentKind } from '@domain/rules/lessonCountRules';
import { classifyNeisEvent } from '@domain/entities/NeisSchedule';
import { getKoreanHolidays, getHolidayName } from '@domain/rules/holidayRules';
import { toLocalIsoDate } from '@domain/rules/schoolTermStart';

export interface LessonCountView extends LessonCountEstimate {
  /** 학기 종료일이 아직 없어 계산을 시작조차 못 한 상태. 화면은 종료일을 묻는다. */
  readonly needsTermEnd: boolean;
  /** 학기 라벨('2026-2') — 화면 문구에 쓴다. */
  readonly term: string;
}

/** 'YYYY-MM-DD'에서 연도만. 형식이 아니면 null. */
function yearOf(iso: string): number | null {
  const m = /^(\d{4})-\d{2}-\d{2}$/.exec(iso);
  return m === null ? null : Number(m[1]);
}

export function useLessonCountEstimate(classId: string): LessonCountView {
  const classes = useTeachingClassStore((s) => s.classes);
  const lessonDayAdjustments = useTeachingClassStore((s) => s.lessonDayAdjustments);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const overrides = useScheduleStore((s) => s.overrides);
  const weekendDays = useSettingsStore((s) => s.settings.enableWeekendDays);
  const events = useEventsStore((s) => s.events);
  const { term, startIso, endIso } = useTermRange();

  const todayIso = toLocalIsoDate(new Date());

  /** 1단계 — 학기 전체 수업일 색인. 무거운 쪽이라 의존성을 좁게 잡는다. */
  const indexResult = useMemo(() => {
    if (endIso === null) return null;
    return buildLessonDayIndexResult({
      termStart: startIso,
      termEnd: endIso,
      weekendDays,
      teacherSchedule,
      classSchedule,
      overrides,
      classes,
      targetClassId: classId,
    });
  }, [startIso, endIso, weekendDays, teacherSchedule, classSchedule, overrides, classes, classId]);

  /** 그날의 공휴일 이름 — 학기가 걸친 연도만 계산한다. */
  const holidayNameByDate = useMemo(() => {
    const map = new Map<string, string>();
    if (indexResult === null) return map;
    const years = new Set<number>();
    for (const iso of indexResult.index.keys()) {
      const y = yearOf(iso);
      if (y !== null) years.add(y);
    }
    for (const y of years) {
      const holidays = getKoreanHolidays(y);
      for (const iso of indexResult.index.keys()) {
        if (yearOf(iso) !== y) continue;
        const name = getHolidayName(iso, holidays);
        if (name !== null) map.set(iso, name);
      }
    }
    return map;
  }, [indexResult]);

  /** 날짜별 학사일정 — 분류(`classifyNeisEvent`)를 붙여서 넘긴다. */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, LessonDayEvent[]>();
    for (const e of events) {
      if (e.isHidden === true) continue;
      const title = e.neis?.eventName ?? e.title;
      const group = classifyNeisEvent({
        title,
        subtractDayType: e.neis?.subtractDayType ?? '',
      });
      const list = map.get(e.date);
      if (list === undefined) map.set(e.date, [{ title, group }]);
      else list.push({ title, group });
    }
    return map;
  }, [events]);

  /** 이 반의 정정만 날짜 → 종류로. */
  const adjustmentByDate = useMemo(() => {
    const map = new Map<string, LessonDayAdjustmentKind>();
    for (const a of lessonDayAdjustments) {
      if (a.classId === classId) map.set(a.date, a.kind);
    }
    return map;
  }, [lessonDayAdjustments, classId]);

  /** 2단계 — 색인을 훑어 집계한다. 색인을 다시 만들지 않는다. */
  return useMemo(() => {
    if (indexResult === null) {
      return {
        status: 'noTimetable' as const,
        totalPeriods: 0,
        pastPeriods: 0,
        remainingPeriods: 0,
        lessonDays: [],
        excludedDays: [],
        hasFutureEstimate: false,
        needsTermEnd: true,
        term,
      };
    }
    const estimate = estimateLessonCount({
      lessonDayIndex: indexResult.index,
      indexUnavailable: indexResult.unavailable,
      holidayNameByDate,
      eventsByDate,
      adjustmentByDate,
      todayIso,
    });
    return { ...estimate, needsTermEnd: false, term };
  }, [indexResult, holidayNameByDate, eventsByDate, adjustmentByDate, todayIso, term]);
}

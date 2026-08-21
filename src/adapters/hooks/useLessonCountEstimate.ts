/**
 * 진도 화면에 "이번 학기 예상 몇 차시"를 공급하는 훅 (PC).
 *
 * 계산 자체는 전부 도메인 순수 함수가 한다(`buildLessonDayIndexResult` → `estimateLessonCount`).
 * 재료 가공도 `lessonCountViewParts`가 한다 — **모바일 훅과 같은 함수를 써야 두 기기가 같은
 * 숫자를 낸다.** 각자 공휴일 지도를 만들고 학사일정을 분류하면, 한쪽만 고쳤을 때 같은 반의
 * 차시가 기기마다 달라진다. 이 훅에 남는 것은 "어느 스토어에서 무엇을 꺼내는가"뿐이다.
 *
 * ## 다시 계산하는 시점을 좁게 잡는다
 *
 * 학기 색인(`lessonDayIndex`)은 시간표·변동·학기 구간·반 목록이 바뀔 때만 다시 만든다.
 * **진도 기록은 의존성에 넣지 않는다** — 수업 한 건 적을 때마다 학기 100일을 다시 훑으면
 * 입력이 버벅인다.
 *
 * 반대로 공휴일·학사일정·사용자 정정은 결과를 바꾸므로 두 번째 `useMemo`에 넣되,
 * 그 단계는 색인을 다시 만들지 않고 이미 만들어진 날짜만 훑는다.
 */

import { useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useTermRange } from './useTermRange';
import {
  buildHolidayMap,
  buildEventMap,
  buildAdjustmentMap,
  termEndUnknownView,
  type LessonCountView,
} from './lessonCountViewParts';
import { buildLessonDayIndexResult } from '@domain/rules/buildLessonDayIndex';
import { estimateLessonCount } from '@domain/rules/lessonCountRules';
import { toLocalIsoDate } from '@domain/rules/schoolTermStart';

export type { LessonCountView };

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

  const holidayNameByDate = useMemo(
    () => buildHolidayMap(indexResult === null ? [] : indexResult.index.keys()),
    [indexResult],
  );
  const eventsByDate = useMemo(() => buildEventMap(events), [events]);
  const adjustmentByDate = useMemo(
    () => buildAdjustmentMap(lessonDayAdjustments, classId),
    [lessonDayAdjustments, classId],
  );

  /** 2단계 — 색인을 훑어 집계한다. 색인을 다시 만들지 않는다. */
  return useMemo(() => {
    if (indexResult === null) return termEndUnknownView(term);
    const estimate = estimateLessonCount({
      lessonDayIndex: indexResult.index,
      indexUnavailable: indexResult.unavailable,
      holidayNameByDate,
      eventsByDate,
      adjustmentByDate,
      todayIso,
    });
    return { ...estimate, needsTermEnd: false, term, termEndIso: endIso };
  }, [indexResult, holidayNameByDate, eventsByDate, adjustmentByDate, todayIso, term, endIso]);
}

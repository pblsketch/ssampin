/**
 * 모바일에서 "이번 학기 예상 몇 차시"를 공급하는 훅 — 데스크톱 `useLessonCountEstimate`의 짝.
 *
 * ## 두 기기가 같은 숫자를 내야 한다
 *
 * 계산(`buildLessonDayIndexResult` → `estimateLessonCount`)과 재료 가공(`lessonCountViewParts`)을
 * **데스크톱과 똑같은 함수로** 한다. 이 훅에 있는 것은 "모바일 스토어에서 무엇을 꺼내는가"뿐이다.
 * 각자 계산하면 한쪽만 고쳤을 때 같은 반의 차시가 기기마다 달라지고, 그 어긋남은 알아채기
 * 어려우면서도 알아채면 숫자 전체를 못 믿게 만든다.
 *
 * ⚠️ 그래서 **변동 시간표(`overrides`)를 반드시 함께 넣는다.** 모바일이 이걸 빼먹으면 결·보강이
 * 반영되지 않아 PC보다 차시가 많거나 적게 나온다. `timetable-overrides`는 동기화 대상이라
 * 모바일에도 파일이 온다.
 */

import { useMemo } from 'react';
import { useMobileTeachingClassStore } from '@mobile/stores/useMobileTeachingClassStore';
import { useMobileProgressStore } from '@mobile/stores/useMobileProgressStore';
import { useMobileScheduleStore } from '@mobile/stores/useMobileScheduleStore';
import { useMobileSettingsStore } from '@mobile/stores/useMobileSettingsStore';
import { useMobileEventsStore } from '@mobile/stores/useMobileEventsStore';
import { useMobileCurrentTerm, useMobileCurrentTermStartIso } from './useMobileCurrentTerm';
import {
  buildHolidayMap,
  buildEventMap,
  buildAdjustmentMap,
  termEndUnknownView,
  type LessonCountView,
} from '@adapters/hooks/lessonCountViewParts';
import { buildLessonDayIndexResult } from '@domain/rules/buildLessonDayIndex';
import { estimateLessonCount } from '@domain/rules/lessonCountRules';
import { toLocalIsoDate } from '@domain/rules/schoolTermStart';

export type { LessonCountView };

export function useMobileLessonCountEstimate(classId: string): LessonCountView {
  const classes = useMobileTeachingClassStore((s) => s.classes);
  const lessonDayAdjustments = useMobileProgressStore((s) => s.lessonDayAdjustments);
  const teacherSchedule = useMobileScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useMobileScheduleStore((s) => s.classSchedule);
  const overrides = useMobileScheduleStore((s) => s.overrides);
  const weekendDays = useMobileSettingsStore((s) => s.settings.enableWeekendDays);
  const termEndDates = useMobileSettingsStore((s) => s.settings.termEndDates);
  const events = useMobileEventsStore((s) => s.events);

  const term = useMobileCurrentTerm();
  const startIso = useMobileCurrentTermStartIso();
  const endIso = termEndDates?.[term] ?? null;

  const todayIso = toLocalIsoDate(new Date());

  /** 1단계 — 학기 전체 수업일 색인. 무거운 쪽이라 의존성을 좁게 잡는다. */
  const indexResult = useMemo(() => {
    if (endIso === null) return null;
    return buildLessonDayIndexResult({
      termStart: startIso,
      termEnd: endIso,
      weekendDays,
      teacherSchedule,
      // 모바일은 담임이 아니면 학급 시간표가 없다 — 없으면 폴백 없이 계산한다.
      classSchedule: classSchedule ?? {},
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

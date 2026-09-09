/**
 * 학급 목록에 "평소 언제 수업하는 반인지"(요일·교시)를 공급하는 훅.
 *
 * 판정은 도메인 순수 함수(`getWeeklyLessonSlots`)가, 문구 조립은 presenter가 한다.
 * 여기 남는 것은 "어느 스토어에서 무엇을 꺼내는가"와 시간표를 한 번 불러오는 일뿐이다.
 *
 * ## 반마다 훅을 부르지 않는다
 *
 * 목록의 반이 20개면 훅 20개가 각자 시간표를 구독하게 된다. 그래서 이 훅은 **목록 전체를 한 번에**
 * 받아 반 → 문구 Map을 돌려준다. 시간표·교시 이름이 바뀔 때만 통째로 다시 계산한다.
 *
 * ## 시간표를 여기서 불러오는 이유
 *
 * 학급 목록은 진도·출석 탭보다 먼저 보인다. 그 탭들이 `load()`를 부르기 전에는 시간표가 비어 있어
 * 요일·교시가 통째로 안 보인다. `load()`는 이미 불러왔으면 즉시 반환하므로 중복 호출은 안전하다.
 */

import { useEffect, useMemo } from 'react';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import {
  toClassScheduleLabel,
  type ClassScheduleLabel,
} from '@adapters/presenters/classSchedulePresenter';
import { getWeeklyLessonSlots } from '@domain/rules/weeklyLessonSlots';
import type { TeachingClass } from '@domain/entities/TeachingClass';

export type { ClassScheduleLabel };

/** 반 id → 그 반의 수업 요일·교시 문구. **찾은 칸이 없는 반은 키 자체가 없다.** */
export function useClassScheduleLabels(
  classes: readonly TeachingClass[],
): ReadonlyMap<string, ClassScheduleLabel> {
  const loadSchedule = useScheduleStore((s) => s.load);
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const classSchedule = useScheduleStore((s) => s.classSchedule);
  const weekendDays = useSettingsStore((s) => s.settings.enableWeekendDays);
  const periodTimes = useSettingsStore((s) => s.settings.periodTimes);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  return useMemo(() => {
    const result = new Map<string, ClassScheduleLabel>();
    for (const cls of classes) {
      const slots = getWeeklyLessonSlots({
        className: cls.name,
        classSubject: cls.subject,
        teacherSchedule,
        classSchedule,
        weekendDays,
      });
      const label = toClassScheduleLabel(slots, periodTimes);
      if (label !== null) result.set(cls.id, label);
    }
    return result;
  }, [classes, teacherSchedule, classSchedule, weekendDays, periodTimes]);
}

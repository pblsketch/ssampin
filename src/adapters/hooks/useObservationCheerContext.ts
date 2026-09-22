/**
 * 관찰 기록 응원(ADR-135) — 학사일정·학기 정보를 계산 규칙이 받는 모양으로 한 번만 조립한다.
 *
 * 기록 알림(`useReminderScheduler`·`useReminderOsPush`)과 잔디·한 바퀴가 **같은 조립**을 쓴다.
 * 두 벌로 만들면 종과 알림이 다른 학생을 가리킨다.
 *
 * ★학사일정은 **나이스에서 불러온 학교 일정만** 쓴다. 선생님이 만든 일정·구글 일정은 제목에
 *   '평가'·'방학'이 있어도 쓰지 않는다. 숨긴 일정도 뺀다.
 * ★여러 날 일정은 `endDate` 까지 펼친다(`lessonCountViewParts.buildEventMap` 은 시작일만 보므로
 *   그대로 가져다 쓰지 않는다).
 */
import { useEffect, useMemo } from 'react';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useCurrentTerm, useCurrentTermStartIso } from '@adapters/hooks/useCurrentTerm';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import { classifyNeisEvent } from '@domain/entities/NeisSchedule';
import { getKoreanHolidays } from '@domain/rules/holidayRules';
import {
  buildSchoolCalendarDays,
  type SchoolCalendarDays,
  type SchoolCalendarEvent,
} from '@domain/rules/schoolCalendarDays';
import { termEndDate, toLocalIsoDate } from '@domain/rules/schoolTermStart';

/** 나이스 학교 일정만 골라 분류를 붙인다. */
export function toSchoolCalendarEvents(events: readonly SchoolEvent[]): SchoolCalendarEvent[] {
  const out: SchoolCalendarEvent[] = [];
  for (const e of events) {
    if (e.isHidden === true) continue;
    if (e.source !== 'neis' && e.neis === undefined) continue;
    const title = e.neis?.eventName ?? e.title;
    out.push({
      title,
      date: e.date,
      ...(e.endDate !== undefined ? { endDate: e.endDate } : {}),
      group: classifyNeisEvent({ title, subtractDayType: e.neis?.subtractDayType ?? '' }),
    });
  }
  return out;
}

/**
 * 학사일정 + 법정 공휴일(작년·올해·내년) → 날짜 집합.
 *
 * ★나이스 학사일정이 하나도 없으면 공휴일도 넣지 않는다 — spec §14 "학사일정이 없으면 방학 날·
 *   쉬는 주가 없는 것으로 계산한다". 공휴일만 넣으면 추석 주가 쉬는 주로 잡혀 이 규칙이 깨진다.
 */
export function buildSchoolCalendarFromEvents(
  events: readonly SchoolEvent[],
  today: Date,
): SchoolCalendarDays {
  const schoolEvents = toSchoolCalendarEvents(events);
  if (schoolEvents.length === 0) return buildSchoolCalendarDays([], []);
  const year = today.getFullYear();
  const holidays: string[] = [];
  for (const y of [year - 1, year, year + 1]) {
    for (const h of getKoreanHolidays(y)) holidays.push(h.date);
  }
  return buildSchoolCalendarDays(schoolEvents, holidays);
}

/** 화면·훅에서 쓰는 학사일정 날짜 집합. 일정이 아직 안 불러와졌으면 불러온다. */
export function useSchoolCalendarDays(): SchoolCalendarDays {
  const events = useEventsStore((s) => s.events);
  const loaded = useEventsStore((s) => s.loaded);
  const todayIso = toLocalIsoDate(new Date());

  useEffect(() => {
    if (!loaded) void useEventsStore.getState().load();
  }, [loaded]);

  return useMemo(
    () => buildSchoolCalendarFromEvents(events, new Date(`${todayIso}T00:00:00`)),
    [events, todayIso],
  );
}

export interface ObservationTermWindow {
  /** 학기 라벨 '2026-2' */
  readonly term: string;
  /** 이번 학기 시작일 */
  readonly termStart: string;
  /** 이번 학기 마지막 날(다음 학기 시작일 전날) */
  readonly termEnd: string;
  /** 오늘 */
  readonly today: string;
}

/** 이번 학기 창 — 앱의 기존 학기 판단(`useCurrentTerm`)을 그대로 쓴다. */
export function useObservationTermWindow(): ObservationTermWindow {
  const term = useCurrentTerm();
  const termStart = useCurrentTermStartIso();
  const termStartDates = useSettingsStore((s) => s.settings.termStartDates);
  const today = toLocalIsoDate(new Date());
  return useMemo(
    () => ({
      term,
      termStart,
      termEnd: termEndDate(term, termStartDates) ?? today,
      today,
    }),
    [term, termStart, termStartDates, today],
  );
}

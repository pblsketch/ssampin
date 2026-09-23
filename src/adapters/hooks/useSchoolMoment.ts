/**
 * 학교 달력 인사(돌아보기 spec 4) — 그날의 인사를 화면·먼저 거는 말에 잇는다.
 *
 * - 날짜 판정은 `@domain/rules/schoolMoments` 가 한다. 여기서는 나이스 학교 일정(숨긴 것 제외)·설정·
 *   등교일 달력을 모아 넘길 뿐이다.
 * - 인사가 **그날 말에 들어간 날**(주인공이든 접힌 조각이든)에만 핀 모습이 바뀐다. 쉬는 날·스위치 끔·
 *   쉬기로 거둔 날은 원래 핀이다.
 */
import { useMemo } from 'react';
import type { SchoolEvent } from '@domain/entities/SchoolEvent';
import type { Settings } from '@domain/entities/Settings';
import { momentOfDay, type SchoolMoment } from '@domain/rules/schoolMoments';
import { resolveCurrentTerm } from '@domain/rules/schoolTermStart';
import type { SchoolCalendarDays } from '@domain/rules/schoolCalendarDays';
import { useEventsStore } from '@adapters/stores/useEventsStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { isRestingToday, useObservationDayStore } from '@adapters/stores/useObservationDayStore';
import {
  buildSchoolCalendarFromEvents,
  toSchoolCalendarEvents,
  useObservationCheerAvailable,
  useSchoolCalendarDays,
} from './useObservationCheerContext';

type MomentSettings = Pick<Settings, 'termStartDates' | 'currentTerm' | 'schoolLevel'>;

/** 그날의 인사 — 나이스 학교 일정·설정·등교일 달력에서. */
export function computeMoment(
  date: string,
  events: readonly SchoolEvent[],
  settings: MomentSettings,
  calendar: SchoolCalendarDays,
): SchoolMoment | null {
  return momentOfDay({
    date,
    events: toSchoolCalendarEvents(events).map((e) => ({ title: e.title, date: e.date })),
    calendar,
    termStartDates: settings.termStartDates,
    ...(settings.currentTerm !== undefined ? { currentTerm: settings.currentTerm } : {}),
    isHighSchool: settings.schoolLevel === 'high',
  });
}

/** 지금 스토어 값으로 오늘의 인사를 계산한다(창 열기처럼 훅 밖에서 쓸 때). */
export function momentForToday(today: string): SchoolMoment | null {
  const events = useEventsStore.getState().events;
  const settings = useSettingsStore.getState().settings;
  const currentTerm = resolveCurrentTerm({
    today: new Date(`${today}T00:00:00`),
    termStartDates: settings.termStartDates,
    currentTerm: settings.currentTerm,
  });
  const calendar = buildSchoolCalendarFromEvents(events, new Date(`${today}T00:00:00`), {
    currentTerm,
    termStartDates: settings.termStartDates,
    termEndDates: settings.termEndDates,
  });
  return computeMoment(today, events, settings, calendar);
}

/** 그날의 인사(화면 훅). */
export function useMomentOfDay(date: string): SchoolMoment | null {
  const events = useEventsStore((s) => s.events);
  const termStartDates = useSettingsStore((s) => s.settings.termStartDates);
  const currentTerm = useSettingsStore((s) => s.settings.currentTerm);
  const schoolLevel = useSettingsStore((s) => s.settings.schoolLevel);
  const calendar = useSchoolCalendarDays();
  return useMemo(
    () => computeMoment(date, events, { termStartDates, currentTerm, schoolLevel }, calendar),
    [date, events, termStartDates, currentTerm, schoolLevel, calendar],
  );
}

/**
 * 오늘 인사가 **그날 말에 들어가 있으면** 그 인사(핀 모습·문구), 아니면 null.
 * 쉬는 날·응원·잔디 꺼짐·쉬기로 거둔 말(`talk.talk === null`)이면 null — 핀이 원래 모습으로 돌아간다.
 */
export function useActiveMoment(today: string): SchoolMoment | null {
  const talk = useObservationDayStore((s) => s.talk);
  const restDay = useObservationDayStore((s) => s.restDay);
  const available = useObservationCheerAvailable();
  const moment = useMomentOfDay(today);
  if (!available || isRestingToday(restDay, today)) return null;
  if (talk.decidedDate !== today || talk.talk === null) return null;
  const { main, folded } = talk.talk;
  return main.kind === 'moment' || folded.some((c) => c.kind === 'moment') ? moment : null;
}

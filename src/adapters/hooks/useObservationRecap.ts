/**
 * 관찰 기록 응원 2·3차(ADR-137) — 한 주 정리·학기 돌아보기 창이 쓰는 훅. 열 때마다(그때까지의
 * 기록으로) 다시 계산한다.
 */
import { useEffect, useMemo } from 'react';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useStudentRecordsStore } from '@adapters/stores/useStudentRecordsStore';
import { useObservationStore } from '@adapters/stores/useObservationStore';
import { useLapMarkStore } from '@adapters/stores/useLapMarkStore';
import { useCurrentTerm } from '@adapters/hooks/useCurrentTerm';
import { useSchoolCalendarDays } from '@adapters/hooks/useObservationCheerContext';
import { useObservationLapCards } from '@adapters/hooks/useObservationCheer';
import { buildTermRecap, buildWeekRecap, type TermRecap, type WeekRecap } from './observationRecap';
import { homeroomEntries, subjectEntries } from '@domain/rules/observationEntries';
import { previousTerm, resolveTermStartDate, termEndDate } from '@domain/rules/schoolTermStart';
import { toLocalDateString } from '@shared/utils/localDate';

export type TermChoice = 'current' | 'previous';

function useRecapStoresLoaded(): void {
  useEffect(() => {
    void useStudentRecordsStore.getState().load();
    void useObservationStore.getState().load();
    void useLapMarkStore.getState().load();
    void useTeachingClassStore.getState().load();
    void useStudentStore.getState().load();
  }, []);
}

/** 한 주 정리의 관찰 조각. 그 주 기록이 없으면 null. */
export function useWeekRecap(week: string | null): WeekRecap | null {
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const calendar = useSchoolCalendarDays();
  useRecapStoresLoaded();
  return useMemo(() => {
    if (week === null) return null;
    const entries = [...homeroomEntries(homeroomRecords), ...subjectEntries(observationRecords)];
    return buildWeekRecap(week, toLocalDateString(new Date()), entries, calendar);
  }, [week, homeroomRecords, observationRecords, calendar]);
}

function homeroomTitle(className: string | undefined): string {
  const name = className?.trim() ?? '';
  return name.length > 0 ? `담임 · ${name}` : '담임반';
}

/** 학기 돌아보기 — 이번 학기 / 지난 학기. 학기 창을 모르면 null. */
export function useTermRecap(choice: TermChoice): TermRecap | null {
  const currentTerm = useCurrentTerm();
  const termStartDates = useSettingsStore((s) => s.settings.termStartDates);
  const className = useSettingsStore((s) => s.settings.className);
  const students = useStudentStore((s) => s.students);
  const classes = useTeachingClassStore((s) => s.classes);
  const homeroomRecords = useStudentRecordsStore((s) => s.records);
  const observationRecords = useObservationStore((s) => s.records);
  const marks = useLapMarkStore((s) => s.marks);
  const calendar = useSchoolCalendarDays();
  const currentCards = useObservationLapCards();
  useRecapStoresLoaded();

  return useMemo(() => {
    const term = choice === 'current' ? currentTerm : previousTerm(currentTerm);
    if (term === null) return null;
    const termStart = resolveTermStartDate(term, termStartDates);
    const today = toLocalDateString(new Date());
    const termEnd = termEndDate(term, termStartDates) ?? today;
    if (termStart === null) return null;
    return buildTermRecap({
      term,
      termStart,
      termEnd,
      today,
      currentTerm,
      homeroomTitle: homeroomTitle(className),
      students,
      classes,
      homeroomRecords,
      observationRecords,
      marks,
      cal: calendar,
      currentCards,
    });
  }, [
    choice,
    currentTerm,
    termStartDates,
    className,
    students,
    classes,
    homeroomRecords,
    observationRecords,
    marks,
    calendar,
    currentCards,
  ]);
}

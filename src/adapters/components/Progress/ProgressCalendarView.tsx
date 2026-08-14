import { useMemo, useState } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  buildWeeklyProgressGrid,
  summarizeClassProgress,
  type ClassProgressSummary,
} from '@domain/rules/progressCalendarRules';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import { ProgressCalendarGrid } from './ProgressCalendarGrid';
import { ProgressQuickEntryModal } from './ProgressQuickEntryModal';
import { useProgressQuickEntry } from './useProgressQuickEntry';

/** 이번 주(오프셋 반영) 월요일 기준 날짜 문자열 배열 계산 */
function computeWeekDates(weekOffset: number, dayCount: number): string[] {
  const base = new Date();
  base.setDate(base.getDate() + weekOffset * 7);
  const jsDay = base.getDay(); // 0=일 ... 6=토
  const mondayOffset = jsDay === 0 ? -6 : 1 - jsDay;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  return Array.from({ length: dayCount }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toLocalDateString(d);
  });
}

function formatWeekLabel(dates: readonly string[]): string {
  if (dates.length === 0) return '';
  const first = dates[0]!;
  const last = dates[dates.length - 1]!;
  const [, fm, fd] = first.split('-');
  const [, lm, ld] = last.split('-');
  return `${Number(fm)}월 ${Number(fd)}일 ~ ${Number(lm)}월 ${Number(ld)}일`;
}

/**
 * 진도 캘린더(B안) — 전체 반의 주간 진도를 요일 × 교시 격자로 표시.
 * selectedClassId를 참조하지 않는다(전체 반 뷰).
 */
export function ProgressCalendarView() {
  const { classes, progressEntries } = useTeachingClassStore();
  const { getEffectiveTeacherSchedule } = useScheduleStore();
  const { settings } = useSettingsStore();

  const weekendDays = settings.enableWeekendDays;
  const activeDays = useMemo(() => getActiveDays(weekendDays), [weekendDays]);
  const maxPeriods = settings.maxPeriods ?? 8;
  const colorBy =
    settings.timetableColorBy ?? (settings.schoolLevel === 'elementary' ? 'subject' : 'classroom');

  const { modal, openAdd, openEntry, submit, remove, close, accentFor, fanout } =
    useProgressQuickEntry({
      colorBy,
      subjectColors: settings.subjectColors,
      classroomColors: settings.classroomColors,
    });

  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(
    () => computeWeekDates(weekOffset, activeDays.length),
    [weekOffset, activeDays.length],
  );

  const periods = useMemo(() => Array.from({ length: maxPeriods }, (_, i) => i + 1), [maxPeriods]);

  // 날짜별 유효 교사 시간표(변동 머지) — 도메인 셀렉터에 주입
  const dayTeacherSchedules = useMemo<ReadonlyArray<ReadonlyArray<TeacherPeriod | null>>>(
    () => weekDates.map((date) => getEffectiveTeacherSchedule(date, weekendDays)),

    [weekDates, weekendDays, getEffectiveTeacherSchedule],
  );

  const grid = useMemo(
    () =>
      buildWeeklyProgressGrid({
        weekDates,
        periods,
        dayTeacherSchedules,
        progressEntries,
        classes,
      }),
    [weekDates, periods, dayTeacherSchedules, progressEntries, classes],
  );

  const classSummaries = useMemo(() => {
    const map = new Map<string, ClassProgressSummary>();
    for (const cls of classes) {
      map.set(cls.id, summarizeClassProgress(progressEntries.filter((e) => e.classId === cls.id)));
    }
    return map;
  }, [classes, progressEntries]);

  if (classes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-sp-muted">
        <span className="material-symbols-outlined mb-3 text-5xl opacity-30">calendar_month</span>
        <p className="text-sm">학급을 추가하면 진도를 캘린더로 볼 수 있어요.</p>
      </div>
    );
  }

  return (
    <>
      <ProgressCalendarGrid
        weekDates={weekDates}
        dayLabels={activeDays}
        periods={periods}
        periodTimes={settings.periodTimes}
        grid={grid}
        colorBy={colorBy}
        subjectColors={settings.subjectColors}
        classroomColors={settings.classroomColors}
        classSummaries={classSummaries}
        weekLabel={formatWeekLabel(weekDates)}
        onPrevWeek={() => setWeekOffset((w) => w - 1)}
        onNextWeek={() => setWeekOffset((w) => w + 1)}
        onToday={() => setWeekOffset(0)}
        onEmptyCellClick={openAdd}
        onEntryClick={openEntry}
      />

      {modal && modal.cell.matchedClass && (
        <ProgressQuickEntryModal
          mode={modal.mode}
          className={`${modal.cell.matchedClass.name} · ${modal.cell.matchedClass.subject}`}
          initialValues={modal.values}
          initialStatus={modal.status}
          matchingPeriods={[modal.cell.period]}
          accentColor={accentFor(modal.cell)}
          maxPeriods={maxPeriods}
          fanout={fanout}
          onSubmit={submit}
          onDelete={modal.mode === 'edit' ? remove : undefined}
          onClose={close}
        />
      )}
    </>
  );
}

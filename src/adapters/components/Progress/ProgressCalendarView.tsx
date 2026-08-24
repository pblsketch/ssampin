import { useCallback, useMemo, useState } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { getActiveDays } from '@domain/valueObjects/DayOfWeek';
import { toLocalDateString } from '@shared/utils/localDate';
import {
  buildWeeklyProgressGrid,
  summarizeClassProgress,
  type ClassProgressSummary,
} from '@domain/rules/progressCalendarRules';
import { canDropProgressCell, planProgressMove } from '@domain/rules/progressMove';
import { planProgressShift } from '@domain/rules/progressShift';
import { resolvePeriodLabel } from '@domain/rules/periodLabel';
import { useLessonCountEstimate } from '@adapters/hooks/useLessonCountEstimate';
import { ProgressShiftModal } from './ProgressShiftModal';
import type { WeeklyProgressCell } from '@domain/rules/progressCalendarRules';
import type { TeacherPeriod } from '@domain/entities/Timetable';
import { ProgressCalendarGrid } from './ProgressCalendarGrid';
import { ProgressQuickEntryModal } from './ProgressQuickEntryModal';
import type { ProgressEntry } from '@domain/entities/CurriculumProgress';
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
  const { classes, progressEntries, updateProgressEntries } = useTeachingClassStore();
  const showToast = useToastStore((s) => s.show);
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

  /*
    "여기부터 밀기" — 어느 칸을 기준으로 미는지만 들고 있고, 계산은 도메인이 한다.

    학기 수업일(view.lessonDays)은 반마다 다르므로 훅에 반 id 를 준다. 훅은 조건부로 부를 수
    없어 창이 닫혀 있을 때도 부르는데, 빈 문자열이면 훅이 빈 목록을 돌려주므로 안전하다.
  */
  const [shiftAnchor, setShiftAnchor] = useState<WeeklyProgressCell | null>(null);
  const shiftClassId = shiftAnchor?.matchedClass?.id ?? '';
  const lessonCountView = useLessonCountEstimate(shiftClassId);

  const shiftPlan = useMemo(() => {
    if (!shiftAnchor?.matchedClass) return null;
    return planProgressShift({
      entries: progressEntries,
      classId: shiftAnchor.matchedClass.id,
      from: { date: shiftAnchor.date, period: shiftAnchor.period },
      lessonDays: lessonCountView.lessonDays,
    });
  }, [shiftAnchor, progressEntries, lessonCountView.lessonDays]);

  const applyEntries = useCallback(
    async (list: readonly ProgressEntry[]) => {
      // 한 건씩 저장하지 않는다 — 20차시를 밀면 20번 읽고 쓰다 중간 실패 시 절반만 밀린다.
      await updateProgressEntries(list);
    },
    [updateProgressEntries],
  );

  /*
    진도를 끌어다 다른 칸에 놓았을 때 (2026-08-23).

    실수로 끌리기 쉬운 조작이라 되돌리기를 함께 띄운다. 되돌리기는 "원래 값을 그대로 다시
    저장"이면 충분하다 — 옮기기는 만들거나 지우지 않고 날짜·교시만 바꾸기 때문이다.
    막는 판정과 새 값 계산은 도메인(canDropProgressCell / planProgressMove)이 맡는다.
  */
  const handleMoveCell = useCallback(
    (source: WeeklyProgressCell, target: WeeklyProgressCell) => {
      const check = canDropProgressCell(source, target);
      if (!check.ok) {
        showToast(check.reason, 'info');
        return;
      }
      const plan = planProgressMove(source, target);
      if (!plan) return;

      // 되돌리기용 원본은 바꾸기 전에 붙잡아 둔다
      const originals = [...source.entries, ...target.entries];

      void (async () => {
        await updateProgressEntries([...plan.moved, ...plan.swapped]);
        const [, m, d] = target.date.split('-');
        // 교시 이름을 붙인 선생님에겐 '3교시'가 틀린 표기다 — 라벨은 반드시 도메인이 만든다.
        const periodLabel = resolvePeriodLabel(target.period, settings.periodTimes);
        const where = `${Number(m)}월 ${Number(d)}일 ${periodLabel}`;
        showToast(
          plan.swapped.length > 0
            ? `${where} 진도와 자리를 맞바꿨습니다`
            : `진도를 ${where}로 옮겼습니다`,
          'success',
          {
            label: '되돌리기',
            onClick: () => {
              void updateProgressEntries(originals);
            },
          },
          5000,
        );
      })();
    },
    [showToast, updateProgressEntries, settings.periodTimes],
  );

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
        onMoveCell={handleMoveCell}
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
          onShiftFromHere={
            modal.mode === 'edit'
              ? () => {
                  const anchor = modal.cell;
                  close();
                  setShiftAnchor(anchor);
                }
              : undefined
          }
          onClose={close}
        />
      )}

      {shiftAnchor?.matchedClass && shiftPlan && (
        <ProgressShiftModal
          plan={shiftPlan}
          className={`${shiftAnchor.matchedClass.name} · ${shiftAnchor.matchedClass.subject}`}
          periodTimes={settings.periodTimes}
          onConfirm={applyEntries}
          onUndo={applyEntries}
          onClose={() => setShiftAnchor(null)}
        />
      )}
    </>
  );
}

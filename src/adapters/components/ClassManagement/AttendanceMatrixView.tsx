import { useMemo, useEffect, useState } from 'react';
import type { StudentAttendance } from '@domain/entities/Attendance';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { isStudentActive } from '@domain/rules/studentActivity';
import { AttendanceMatrixCore } from './shared/AttendanceMatrixCore';

const MATRIX_MULTI_DATE_GUIDE_KEY = 'ssampin:attendance-matrix-multi-date-guide-dismissed';

export interface AttendanceMatrixViewProps {
  classId: string;
  date: string;
  onDateChange: (date: string) => void;
}

export function AttendanceMatrixView({ classId, date, onDateChange }: AttendanceMatrixViewProps) {
  const { classes, getDayAttendance, saveDayAttendance } = useTeachingClassStore();
  const teacherSchedule = useScheduleStore((s) => s.teacherSchedule);
  const scheduleOverrides = useScheduleStore((s) => s.overrides);
  const loadSchedule = useScheduleStore((s) => s.load);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  const sortedStudents = useMemo(() => {
    const raw = (cls?.students ?? []).filter(isStudentActive);
    const hasGrade = raw.some((s) => s.grade != null || s.classNum != null);
    if (!hasGrade) return raw;
    return [...raw].sort((a, b) => {
      if ((a.grade ?? 0) !== (b.grade ?? 0)) return (a.grade ?? 0) - (b.grade ?? 0);
      if ((a.classNum ?? 0) !== (b.classNum ?? 0)) return (a.classNum ?? 0) - (b.classNum ?? 0);
      return a.number - b.number;
    });
  }, [cls]);

  /* ── 매칭 교시 계산 ── */
  const matchingPeriods = useMemo(() => {
    if (!cls) return new Set<number>();
    const d = new Date(date + 'T00:00:00');
    const dayOfWeekVal = getDayOfWeek(d);
    if (!dayOfWeekVal) return new Set<number>();
    const baseSchedule = teacherSchedule[dayOfWeekVal] ?? [];
    const dayOverrides = scheduleOverrides.filter((o) => o.date === date);
    const periods = [...baseSchedule];
    for (const override of dayOverrides) {
      const idx = override.period - 1;
      if (idx >= 0 && idx < periods.length) {
        periods[idx] = override.subject
          ? { subject: override.subject, classroom: override.classroom ?? '' }
          : null;
      }
    }
    const matching = new Set<number>();
    periods.forEach((slot, idx) => {
      if (slot && slot.classroom === cls.name && slot.subject === cls.subject) {
        matching.add(idx + 1);
      }
    });
    return matching;
  }, [cls, date, teacherSchedule, scheduleOverrides]);

  /* ── 데이터 소스 콜백 ── */
  const loadDayRecords = useMemo(
    () => (d: string) => getDayAttendance(classId, d),
    [classId, getDayAttendance],
  );

  const saveDay = useMemo(
    () => async (d: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => {
      await saveDayAttendance(classId, d, byPeriod);
    },
    [classId, saveDayAttendance],
  );

  /* ── 학생 목록: TeachingClassStudent → MatrixStudent ── */
  const matrixStudents = useMemo(
    () =>
      sortedStudents.map((s) => ({
        number: s.number,
        name: s.name,
        grade: s.grade,
        classNum: s.classNum,
      })),
    [sortedStudents],
  );

  const [guideDismissed, setGuideDismissed] = useState(
    () => localStorage.getItem(MATRIX_MULTI_DATE_GUIDE_KEY) === 'true',
  );

  const dismissGuide = () => {
    setGuideDismissed(true);
    localStorage.setItem(MATRIX_MULTI_DATE_GUIDE_KEY, 'true');
  };

  return (
    <div className="flex flex-col gap-2">
      {!guideDismissed && (
        <div
          role="note"
          className="flex items-start gap-2 bg-sp-accent/10 border border-sp-accent/30 rounded-xl px-4 py-2.5 text-sm text-sp-accent"
        >
          <span className="material-symbols-outlined text-base">info</span>
          <div className="flex-1">
            <div className="font-medium">
              전체 교시 매트릭스는 한 번에 한 날짜만 편집할 수 있습니다
            </div>
            <div className="text-xs text-sp-muted mt-0.5">
              여러 날짜를 일괄 등록하려면 상단 [단일 교시] 모드로 전환 후 [여러 날] 토글을
              사용해주세요.
            </div>
          </div>
          <button
            type="button"
            onClick={dismissGuide}
            aria-label="안내 닫기"
            className="shrink-0 p-1 rounded-lg hover:bg-sp-text/10 transition-colors text-sp-muted"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
      <AttendanceMatrixCore
        students={matrixStudents}
        classId={classId}
        date={date}
        onDateChange={onDateChange}
        loadDayRecords={loadDayRecords}
        saveDay={saveDay}
        matchingPeriods={matchingPeriods}
      />
    </div>
  );
}

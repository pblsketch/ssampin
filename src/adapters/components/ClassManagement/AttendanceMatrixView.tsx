import { useMemo, useEffect } from 'react';
import type { StudentAttendance } from '@domain/entities/Attendance';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { useScheduleStore } from '@adapters/stores/useScheduleStore';
import { getDayOfWeek } from '@domain/rules/periodRules';
import { AttendanceMatrixCore } from './shared/AttendanceMatrixCore';

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
    const raw = (cls?.students ?? []).filter((s) => !s.isVacant);
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
    () =>
      async (d: string, byPeriod: ReadonlyMap<number, readonly StudentAttendance[]>) => {
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

  return (
    <AttendanceMatrixCore
      students={matrixStudents}
      classId={classId}
      date={date}
      onDateChange={onDateChange}
      loadDayRecords={loadDayRecords}
      saveDay={saveDay}
      matchingPeriods={matchingPeriods}
    />
  );
}

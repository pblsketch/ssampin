import React, { useState } from 'react';
import type { TeachingClass, TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

// ============================================================
// 수업반 좌석 뷰
// ============================================================

interface TeachingSeatingViewProps {
  teachingClass: TeachingClass;
  onStudentTap: (student: TeachingClassStudent) => void;
  dateStr: string;
  getRecordForDate: (
    classId: string,
    period: number,
    dateStr: string,
  ) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

export function TeachingSeatingView({
  teachingClass,
  onStudentTap,
  dateStr,
  getRecordForDate,
}: TeachingSeatingViewProps) {
  const seatingDefaultView = useSettingsStore((s) => s.settings.seatingDefaultView);
  const [isTeacherView, setIsTeacherView] = useState(seatingDefaultView === 'teacher');
  const record = getRecordForDate(teachingClass.id, 0, dateStr);

  const seating = teachingClass.seating;

  // studentKey → 학생 정보 맵
  const studentMap = React.useMemo(() => {
    const map = new Map<string, TeachingClassStudent>();
    for (const s of teachingClass.students) {
      map.set(studentKey(s), s);
    }
    return map;
  }, [teachingClass.students]);

  const getStudentStatus = (
    student: TeachingClassStudent | null | undefined,
  ): AttendanceStatus | null => {
    if (!record || !student) return null;
    const sKey = studentKey(student);
    const found = record.students.find((sa) => {
      const saKey =
        sa.grade != null && sa.classNum != null
          ? `${sa.grade}-${sa.classNum}-${sa.number}`
          : String(sa.number);
      return saKey === sKey;
    });
    return found?.status ?? null;
  };

  const seatColorByStatus = (status: AttendanceStatus | null): string => {
    switch (status) {
      case 'present':
        return 'bg-green-400/15 border-green-400/40 text-sp-text active:bg-green-400/25';
      case 'late':
        return 'bg-yellow-400/15 border-yellow-400/40 text-sp-text active:bg-yellow-400/25';
      case 'absent':
        return 'bg-red-400/15 border-red-400/40 text-sp-text active:bg-red-400/25';
      case 'earlyLeave':
        return 'bg-orange-400/15 border-orange-400/40 text-sp-text active:bg-orange-400/25';
      case 'classAbsence':
        return 'bg-purple-400/15 border-purple-400/40 text-sp-text active:bg-purple-400/25';
      default:
        return 'bg-sp-accent/10 border-sp-accent/30 text-sp-text active:bg-sp-accent/25';
    }
  };

  if (!seating) return null;

  const { rows, cols, seats } = seating;

  return (
    <div className="flex flex-col items-center px-4 py-4 gap-3">
      {/* 교탁 (학생 시점: 위) */}
      {!isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 좌석 그리드 */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }, (_, rowIdx) =>
          Array.from({ length: cols }, (_, colIdx) => {
            // 교사 시점: 180° 회전
            const ri = isTeacherView ? rows - 1 - rowIdx : rowIdx;
            const ci = isTeacherView ? cols - 1 - colIdx : colIdx;
            const sKey = seats[ri]?.[ci] ?? null;
            const student = sKey ? studentMap.get(sKey) : null;
            const isVacant = student?.isVacant ?? false;
            const hasStudent = sKey !== null && student !== undefined;
            const tappable = hasStudent && !isVacant;
            const status = tappable ? getStudentStatus(student) : null;

            return (
              <button
                key={`${rowIdx}-${colIdx}`}
                disabled={!tappable}
                onClick={() => tappable && student && onStudentTap(student)}
                className={`w-12 h-12 flex flex-col items-center justify-center gap-1 rounded-lg border text-xs leading-tight transition-colors ${
                  tappable
                    ? seatColorByStatus(status)
                    : hasStudent && isVacant
                      ? 'bg-sp-surface/50 border-sp-border text-sp-muted opacity-40'
                      : 'bg-sp-surface/30 border-sp-border/50 text-sp-muted/30'
                }`}
              >
                {hasStudent && !isVacant ? (
                  <>
                    {student?.grade != null && student?.classNum != null ? (
                      <span className="text-sp-muted text-micro leading-none">
                        {student.grade}-{student.classNum}
                      </span>
                    ) : (
                      <span className="text-sp-muted text-tiny leading-none">
                        {student?.number}
                      </span>
                    )}
                    <span className="font-medium text-detail leading-none tracking-tight max-w-full">
                      {student?.name ?? '?'}
                    </span>
                  </>
                ) : hasStudent && isVacant ? (
                  <span className="text-caption">결번</span>
                ) : null}
              </button>
            );
          }),
        )}
      </div>

      {/* 교탁 (교사 시점: 아래) */}
      {isTeacherView && (
        <div className="w-full max-w-sm flex justify-center">
          <div className="px-6 py-2 bg-sp-surface border border-sp-border rounded-lg text-sp-muted text-sm font-medium">
            교탁
          </div>
        </div>
      )}

      {/* 범례 + 시점 토글 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-accent/10 border border-sp-accent/30" />
            <span className="text-sp-muted text-xs">미기록</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-green-400/15 border border-green-400/40" />
            <span className="text-sp-muted text-xs">출석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-yellow-400/15 border border-yellow-400/40" />
            <span className="text-sp-muted text-xs">지각</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-red-400/15 border border-red-400/40" />
            <span className="text-sp-muted text-xs">결석</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-orange-400/15 border border-orange-400/40" />
            <span className="text-sp-muted text-xs">조퇴</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-purple-400/15 border border-purple-400/40" />
            <span className="text-sp-muted text-xs">결과</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-4 rounded bg-sp-surface/30 border border-sp-border/50" />
            <span className="text-sp-muted text-xs">빈 자리</span>
          </div>
        </div>
        <button
          onClick={() => setIsTeacherView(!isTeacherView)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-sp-border text-sp-muted hover:text-sp-text transition-colors"
        >
          <span className="material-symbols-outlined text-sm">
            {isTeacherView ? 'visibility' : 'swap_vert'}
          </span>
          {isTeacherView ? '교사 시점' : '학생 시점'}
        </button>
      </div>
    </div>
  );
}

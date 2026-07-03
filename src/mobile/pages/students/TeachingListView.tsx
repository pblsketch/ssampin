import React from 'react';
import type { TeachingClass, TeachingClassStudent } from '@domain/entities/TeachingClass';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';
import { SwipeRow } from '@mobile/components/SwipeRow/SwipeRow';

// ============================================================
// 수업반 명단 뷰
// ============================================================

interface TeachingListViewProps {
  teachingClass: TeachingClass;
  onStudentTap: (student: TeachingClassStudent) => void;
  onPraise: (student: TeachingClassStudent) => void;
  onQuickRecord: (student: TeachingClassStudent, status: 'late' | 'absent') => void | Promise<void>;
  dateStr: string;
  getRecordForDate: (
    classId: string,
    period: number,
    dateStr: string,
  ) => import('@domain/entities/Attendance').AttendanceRecord | null;
}

export function TeachingListView({
  teachingClass,
  onStudentTap,
  onPraise,
  onQuickRecord,
  dateStr,
  getRecordForDate,
}: TeachingListViewProps) {
  const record = getRecordForDate(teachingClass.id, 0, dateStr);

  const getStudentStatus = (student: TeachingClassStudent): AttendanceStatus | null => {
    if (!record) return null;
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

  const statusDot = (status: AttendanceStatus | null) => {
    switch (status) {
      case 'present':
        return <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />;
      case 'late':
        return <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />;
      case 'absent':
        return <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />;
      case 'earlyLeave':
        return <span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />;
      case 'classAbsence':
        return <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shrink-0" />;
      default:
        return null;
    }
  };

  const students = React.useMemo(
    () => [...teachingClass.students].sort((a, b) => a.number - b.number),
    [teachingClass.students],
  );

  if (students.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sp-muted text-sm">학생 명단이 없습니다.</p>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-sp-border">
      {students.map((student) => {
        const sKey = studentKey(student);
        const status = student.isVacant ? null : getStudentStatus(student);
        const rowButton = (
          <button
            onClick={() => !student.isVacant && onStudentTap(student)}
            disabled={student.isVacant}
            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
              student.isVacant ? 'opacity-40' : 'active:bg-sp-surface/60'
            }`}
          >
            {/* 번호 뱃지 */}
            <span
              className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold shrink-0 ${
                student.isVacant ? 'bg-sp-surface text-sp-muted' : 'bg-sp-accent/15 text-sp-accent'
              }`}
            >
              {student.number}
            </span>

            {/* 이름 + 반 정보 + 출석 dot */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="min-w-0">
                <span
                  className={`text-sm font-medium ${
                    student.isVacant ? 'text-sp-muted line-through' : 'text-sp-text'
                  }`}
                >
                  {student.name}
                </span>
                {student.grade != null && student.classNum != null && (
                  <span className="text-sp-muted text-xs ml-1.5">
                    {student.grade}학년 {student.classNum}반
                  </span>
                )}
              </div>
              {statusDot(status)}
            </div>

            {/* 결번 표시 or 탭 힌트 */}
            {student.isVacant ? (
              <span className="text-xs text-sp-muted bg-sp-surface px-2 py-0.5 rounded-full">
                결번
              </span>
            ) : (
              <span className="material-symbols-outlined text-sp-muted text-icon-md">
                chevron_right
              </span>
            )}
          </button>
        );
        return (
          <li key={sKey}>
            {student.isVacant ? (
              rowButton
            ) : (
              <SwipeRow
                rowId={sKey}
                leftRevealWidth={96}
                rightRevealWidth={148}
                leftActions={
                  <button
                    type="button"
                    onClick={() => onPraise(student)}
                    className="flex w-full flex-col items-center justify-center gap-0.5 bg-emerald-500 text-xs font-bold text-white"
                  >
                    <span className="material-symbols-outlined text-lg">favorite</span>
                    칭찬
                  </button>
                }
                rightActions={
                  <>
                    <button
                      type="button"
                      onClick={() => void onQuickRecord(student, 'late')}
                      className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-yellow-500 text-xs font-bold text-white"
                    >
                      <span className="material-symbols-outlined text-lg">schedule</span>
                      지각
                    </button>
                    <button
                      type="button"
                      onClick={() => void onQuickRecord(student, 'absent')}
                      className="flex flex-1 flex-col items-center justify-center gap-0.5 bg-red-500 text-xs font-bold text-white"
                    >
                      <span className="material-symbols-outlined text-lg">cancel</span>
                      결석
                    </button>
                  </>
                }
              >
                {rowButton}
              </SwipeRow>
            )}
          </li>
        );
      })}
    </ul>
  );
}

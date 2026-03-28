import { useMemo } from 'react';
import type { StudentRecord } from '@domain/entities/StudentRecord';
import type { Student } from '@domain/entities/Student';

interface StudentJumpListProps {
  students: readonly Student[];
  records: readonly StudentRecord[];
  selectedStudentId: string;
  onSelect: (studentId: string) => void;
}

export function StudentJumpList({ students, records, selectedStudentId, onSelect }: StudentJumpListProps) {
  // Record counts and warning indicators per student
  const studentInfo = useMemo(() => {
    const counts = new Map<string, number>();
    const warnings = new Map<string, { unreported: number; overdueFollowUp: number }>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    for (const r of records) {
      counts.set(r.studentId, (counts.get(r.studentId) ?? 0) + 1);

      const w = warnings.get(r.studentId) ?? { unreported: 0, overdueFollowUp: 0 };
      if (r.category === 'attendance' && !r.reportedToNeis) {
        w.unreported++;
      }
      if (r.followUp && !r.followUpDone && r.followUpDate && r.followUpDate < todayStr) {
        w.overdueFollowUp++;
      }
      warnings.set(r.studentId, w);
    }

    return { counts, warnings };
  }, [records]);

  return (
    <div className="w-[180px] shrink-0 rounded-xl bg-sp-card flex flex-col min-h-0">
      <div className="px-3 py-2.5 border-b border-sp-border shrink-0">
        <h4 className="text-xs font-bold text-sp-text flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">people</span>
          학생 목록
        </h4>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* 전체 보기 */}
        <button
          onClick={() => onSelect('')}
          className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
            !selectedStudentId
              ? 'bg-sp-accent/10 text-sp-accent font-bold'
              : 'text-sp-muted hover:bg-sp-surface hover:text-sp-text'
          }`}
        >
          <span className="material-symbols-outlined text-sm">group</span>
          전체
        </button>

        {students.map((student, idx) => {
          if (student.isVacant) return null;
          const count = studentInfo.counts.get(student.id) ?? 0;
          const warning = studentInfo.warnings.get(student.id);
          const hasWarning = warning && (warning.unreported > 0 || warning.overdueFollowUp > 0);
          const isSelected = selectedStudentId === student.id;

          return (
            <button
              key={student.id}
              onClick={() => onSelect(student.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                isSelected
                  ? 'bg-sp-accent/10 text-sp-accent font-bold'
                  : count > 0
                    ? 'text-sp-text hover:bg-sp-surface'
                    : 'text-sp-muted/50 hover:bg-sp-surface hover:text-sp-muted'
              }`}
            >
              <span className="w-5 text-right tabular-nums text-[11px] shrink-0">{idx + 1}</span>
              <span className="truncate flex-1 text-left">{student.name}</span>
              <div className="flex items-center gap-1 shrink-0">
                {hasWarning && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" title={
                    [
                      warning.unreported > 0 ? `나이스 미반영 ${warning.unreported}건` : '',
                      warning.overdueFollowUp > 0 ? `기한 초과 ${warning.overdueFollowUp}건` : '',
                    ].filter(Boolean).join(', ')
                  } />
                )}
                {count > 0 && (
                  <span className={`text-[10px] tabular-nums ${isSelected ? 'text-sp-accent' : 'text-sp-muted'}`}>
                    {count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

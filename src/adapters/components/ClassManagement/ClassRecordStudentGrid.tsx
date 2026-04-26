import { useMemo } from 'react';
import { useTeachingClassStore } from '@adapters/stores/useTeachingClassStore';
import { studentKey } from '@domain/entities/TeachingClass';
import type { AttendanceStatus } from '@domain/entities/Attendance';

const STATUS_BORDER: Record<AttendanceStatus, string> = {
  present: 'border-green-500/40',
  absent: 'border-red-500/60',
  late: 'border-amber-500/60',
  earlyLeave: 'border-orange-500/60',
  classAbsence: 'border-purple-500/60',
};

interface ClassRecordStudentGridProps {
  classId: string;
  selectedStudentKey: string | null;
  onSelectStudent: (key: string) => void;
  attendanceMap: Map<string, AttendanceStatus>;
  recordCountMap: Map<string, number>;
}

export function ClassRecordStudentGrid({
  classId,
  selectedStudentKey,
  onSelectStudent,
  attendanceMap,
  recordCountMap,
}: ClassRecordStudentGridProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  if (!cls?.seating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-sp-muted">
        <span className="material-symbols-outlined text-3xl mb-2 opacity-30">grid_view</span>
        <p className="text-xs">좌석배치를 먼저 설정하세요</p>
        <p className="text-caption mt-1">좌석배치 탭에서 배치를 만든 뒤 사용할 수 있습니다</p>
      </div>
    );
  }

  const { rows, cols, seats } = cls.seating;

  const studentMap = useMemo(() => {
    const m = new Map<string, { number: number; name: string }>();
    for (const s of cls.students) {
      m.set(studentKey(s), { number: s.number, name: s.name });
    }
    return m;
  }, [cls.students]);

  return (
    <div className="flex flex-col items-center gap-1 p-2">
      {/* 교탁 */}
      <div className="w-32 py-1 mb-2 rounded bg-sp-surface text-center text-caption text-sp-muted font-medium">
        교 탁
      </div>

      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-1">
          {Array.from({ length: cols }, (_, c) => {
            const sKey = seats[r]?.[c] ?? null;
            if (!sKey) {
              return (
                <div
                  key={c}
                  className="w-16 h-14 rounded-lg border border-dashed border-sp-border/30"
                />
              );
            }
            const student = studentMap.get(sKey);
            const attStatus = attendanceMap.get(sKey) ?? 'present';
            const borderColor = STATUS_BORDER[attStatus];
            const count = recordCountMap.get(sKey) ?? 0;
            const isSelected = selectedStudentKey === sKey;

            return (
              <button
                key={c}
                onClick={() => onSelectStudent(sKey)}
                className={`relative w-16 h-14 rounded-lg border-2 transition-all text-center
                  ${isSelected ? 'ring-2 ring-sp-accent ring-offset-1 ring-offset-sp-bg' : ''}
                  ${borderColor} bg-sp-surface hover:bg-sp-card`}
              >
                <span className="block text-caption font-bold text-sp-text">
                  {student?.number ?? '?'}
                </span>
                <span className="block text-[9px] text-sp-muted truncate px-0.5">
                  {student?.name ?? ''}
                </span>
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-sp-accent text-white text-[8px] font-bold flex items-center justify-center">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

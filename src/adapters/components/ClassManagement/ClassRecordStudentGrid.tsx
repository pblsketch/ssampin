import { useMemo } from 'react';
import type { CSSProperties } from 'react';
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
  onCreateSeating?: () => void;
}

export function ClassRecordStudentGrid({
  classId,
  selectedStudentKey,
  onSelectStudent,
  attendanceMap,
  recordCountMap,
  onCreateSeating,
}: ClassRecordStudentGridProps) {
  const classes = useTeachingClassStore((s) => s.classes);
  const cls = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);
  const studentMap = useMemo(() => {
    const m = new Map<string, { number: number; name: string }>();
    for (const s of cls?.students ?? []) {
      m.set(studentKey(s), { number: s.number, name: s.name });
    }
    return m;
  }, [cls?.students]);

  if (!cls?.seating) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center text-sp-muted">
        <span className="material-symbols-outlined text-3xl mb-2 opacity-30">grid_view</span>
        <p className="text-xs font-medium text-sp-text">좌석배치를 먼저 설정하세요</p>
        <p className="text-xs mt-1">좌석배치 탭에서 배치를 만든 뒤 사용할 수 있습니다</p>
        {onCreateSeating && (
          <button
            type="button"
            onClick={onCreateSeating}
            className="mt-3 px-3 py-1.5 rounded-lg bg-sp-accent text-white text-xs font-medium hover:brightness-110 transition-all"
          >
            좌석배치 만들러 가기
          </button>
        )}
      </div>
    );
  }

  const { rows, cols, seats } = cls.seating;
  const gridStyle = {
    gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
  } satisfies CSSProperties;

  return (
    <div className="flex w-full flex-col items-center gap-2 p-2">
      {/* 교탁 */}
      <div className="w-32 py-1 mb-2 rounded bg-sp-surface text-center text-xs text-sp-muted font-medium">
        교 탁
      </div>

      <div className="grid w-full max-w-full gap-1.5" style={gridStyle}>
        {Array.from({ length: rows }, (_, r) =>
          Array.from({ length: cols }, (_, c) => {
            const sKey = seats[r]?.[c] ?? null;
            if (!sKey) {
              return (
                <div
                  key={`${r}-${c}`}
                  className="aspect-[1.15/1] min-h-12 rounded-lg border border-dashed border-sp-border/30"
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
                key={`${r}-${c}`}
                onClick={() => onSelectStudent(sKey)}
                aria-label={`${student?.number ?? '?'}번 ${student?.name ?? ''} 학생 선택, 현재 출결 ${attStatus}`}
                className={`relative aspect-[1.15/1] min-h-12 rounded-lg border-2 px-1 text-center transition-all
                  ${isSelected ? 'ring-2 ring-sp-accent ring-offset-1 ring-offset-sp-bg' : ''}
                  ${borderColor} bg-sp-surface hover:bg-sp-card`}
              >
                <span className="block text-xs font-bold text-sp-text">
                  {student?.number ?? '?'}
                </span>
                <span className="block truncate px-0.5 text-xs text-sp-muted">
                  {student?.name ?? ''}
                </span>
                {count > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">
                    {count}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

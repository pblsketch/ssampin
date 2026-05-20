import { useMemo } from 'react';
import type { SeatingData } from '@domain/entities/Seating';
import { useStudentStore } from '@adapters/stores/useStudentStore';

interface SnapshotDiffViewProps {
  /** 현재 좌석 */
  current: SeatingData;
  /** 비교 대상 스냅샷 좌석 */
  snapshot: SeatingData;
}

/**
 * 두 자리배치를 좌우로 비교.
 * 학생 좌표가 다르면 양쪽 모두 노란 외곽선(ring-sp-warning) 강조.
 */
export function SnapshotDiffView({ current, snapshot }: SnapshotDiffViewProps) {
  const getStudent = useStudentStore((s) => s.getStudent);

  /** 학생 ID → 이동 여부 (현재 좌표가 스냅샷 좌표와 다른가) */
  const movedSet = useMemo(() => {
    const positionMap = new Map<string, string>(); // studentId → "r,c" (snapshot)
    snapshot.seats.forEach((row, r) => {
      row.forEach((id, c) => {
        if (id) positionMap.set(id, `${r},${c}`);
      });
    });

    const moved = new Set<string>();
    current.seats.forEach((row, r) => {
      row.forEach((id, c) => {
        if (id) {
          const prev = positionMap.get(id);
          if (prev !== `${r},${c}`) moved.add(id);
        }
      });
    });
    return moved;
  }, [current, snapshot]);

  const renderGrid = (data: SeatingData, label: string) => (
    <div className="flex-1 min-w-0">
      <div className="text-xs text-sp-muted mb-1.5 font-medium">{label}</div>
      <div
        className="grid gap-1 bg-sp-surface/40 rounded-md p-2"
        style={{
          gridTemplateRows: `repeat(${Math.max(1, data.rows)}, minmax(0, 1fr))`,
          gridTemplateColumns: `repeat(${Math.max(1, data.cols)}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: data.rows }).map((_, r) =>
          Array.from({ length: data.cols }).map((__, c) => {
            const id = data.seats[r]?.[c] ?? null;
            const student = getStudent(id);
            const moved = id !== null && movedSet.has(id);
            return (
              <div
                key={`${r}-${c}`}
                className={[
                  'rounded-md min-h-[28px] flex items-center justify-center px-1 py-0.5 text-[10px] leading-tight text-center',
                  id
                    ? 'bg-sp-card border border-sp-border text-sp-text'
                    : 'bg-sp-border/20 text-sp-muted',
                  moved ? 'ring-2 ring-sp-warning' : '',
                  !moved && id ? 'opacity-50' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={student?.name ?? ''}
              >
                {student
                  ? student.name.length > 4
                    ? `${student.name.slice(0, 3)}…`
                    : student.name
                  : ''}
              </div>
            );
          }),
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-3 items-start">
        {renderGrid(current, '현재')}
        {renderGrid(snapshot, '스냅샷')}
      </div>
      <div className="text-xs text-sp-muted flex items-center gap-2 px-1">
        <span
          className="inline-block w-3 h-3 rounded ring-2 ring-sp-warning bg-sp-card"
          aria-hidden="true"
        />
        <span>위치가 바뀐 학생 ({movedSet.size}명)</span>
      </div>
    </div>
  );
}

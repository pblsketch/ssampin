import { useEffect, useMemo, useRef, useState } from 'react';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { buildPairGroups, adjustPairGroupsForRow } from '@domain/rules/seatingLayoutRules';

export function Seating() {
  const { seating, load } = useSeatingStore();
  const { students, load: loadStudents } = useStudentStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [sizeMode, setSizeMode] = useState<'sm' | 'md' | 'lg'>('sm');

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setSizeMode(width < 300 ? 'sm' : width < 500 ? 'md' : 'lg');
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

  const { rows, cols, seats, pairMode, oddColumnMode, layout, groups } = seating;

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const hasSeating = useMemo(() => {
    if (layout === 'group' && groups && groups.length > 0) return true;
    return seats.some((row) => row.some((cell) => cell !== null));
  }, [seats, layout, groups]);

  if (!hasSeating) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          자리배치가 설정되지 않았습니다
        </div>
      </div>
    );
  }

  if (layout === 'group' && groups && groups.length > 0) {
    return (
      <div ref={containerRef} className="rounded-xl bg-sp-card p-3 h-full flex flex-col gap-2 overflow-y-auto">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>💺</span>자리배치</h3>
        </div>
        {groups.map((group) => {
          const groupStudents = group.studentIds
            .map((id) => studentMap.get(id))
            .filter(Boolean);
          return (
            <div
              key={group.id}
              className={`rounded-lg ${sizeMode === 'sm' ? 'px-2 py-1' : 'px-3 py-2'}`}
              style={{ borderLeft: `3px solid ${group.color}`, background: `${group.color}10` }}
            >
              <div className={`font-medium text-sp-text ${sizeMode === 'sm' ? 'text-caption' : 'text-xs'}`}>
                {group.name}
                <span className="text-sp-muted ml-1">({groupStudents.length}명)</span>
              </div>
              {sizeMode !== 'sm' && groupStudents.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {groupStudents.map((s) => (
                    <span
                      key={s!.id}
                      className={`rounded px-1 ${sizeMode === 'lg' ? 'text-xs' : 'text-caption'} text-sp-accent`}
                      style={{ background: `${group.color}20` }}
                    >
                      {s!.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (pairMode) {
    const mode = oddColumnMode ?? 'single';
    const basePairs = buildPairGroups(cols, cols % 2 !== 0 ? mode : 'single');

    return (
      <div ref={containerRef} className="rounded-xl bg-sp-card p-3 h-full flex flex-col gap-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>💺</span>자리배치</h3>
        </div>
        <div className={`rounded bg-sp-border/30 py-0.5 text-center text-sp-muted ${
          sizeMode === 'lg' ? 'text-sm' : sizeMode === 'md' ? 'text-xs' : 'text-caption'
        }`}>교탁</div>

        <div className={`flex flex-col ${sizeMode === 'lg' ? 'gap-2' : sizeMode === 'md' ? 'gap-1.5' : 'gap-1'}`}>
          {Array.from({ length: rows }, (_, r) => {
            const row = seats[r]!;
            const pairs = (mode === 'triple' && cols % 2 === 0)
              ? adjustPairGroupsForRow(basePairs, row)
              : basePairs;

            return (
              <div key={r} className={`flex items-center ${
                sizeMode === 'lg' ? 'gap-4' : sizeMode === 'md' ? 'gap-3' : 'gap-2'
              }`}>
                {pairs.map((pair, pi) => {
                  const isSingle = pair.startCol === pair.endCol;
                  const colRange: number[] = [];
                  for (let c = pair.startCol; c <= pair.endCol; c++) colRange.push(c);

                  return (
                    <div
                      key={pi}
                      className={`flex gap-0.5 flex-1 ${!isSingle ? 'bg-sp-surface/40 rounded px-0.5 py-0.5' : ''}`}
                    >
                      {colRange.map((c) => {
                        const studentId = row[c] ?? null;
                        const student = studentId ? studentMap.get(studentId) : undefined;
                        const hasStudent = studentId !== null;

                        return (
                          <div
                            key={c}
                            className={`${
                              sizeMode === 'lg' ? 'h-8 text-xs' :
                              sizeMode === 'md' ? 'h-6 text-caption' :
                              'h-5 text-micro'
                            } min-w-0 flex-1 rounded-sm flex items-center justify-center ${
                              hasStudent ? 'bg-sp-accent/20 text-sp-accent' : 'bg-sp-surface/30'
                            }`}
                          >
                            {student ? (
                              <span className="truncate max-w-full px-0.5">
                                {sizeMode === 'sm' ? student.name.charAt(0) : student.name}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="rounded-xl bg-sp-card p-3 h-full flex flex-col gap-2">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5"><span>💺</span>자리배치</h3>
      </div>
      <div className={`rounded bg-sp-border/30 py-0.5 text-center text-sp-muted ${
        sizeMode === 'lg' ? 'text-sm' : sizeMode === 'md' ? 'text-xs' : 'text-caption'
      }`}>교탁</div>

      <div
        className={`grid w-full ${sizeMode === 'lg' ? 'gap-2' : sizeMode === 'md' ? 'gap-1.5' : 'gap-1'}`}
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const studentId = seats[r]?.[c] ?? null;
            const student = studentId ? studentMap.get(studentId) : undefined;
            const hasStudent = studentId !== null;

            return (
              <div
                key={`${r}-${c}`}
                className={`${
                  sizeMode === 'lg' ? 'h-8 text-xs' :
                  sizeMode === 'md' ? 'h-6 text-caption' :
                  'h-5 text-micro'
                } rounded-sm flex items-center justify-center ${
                  hasStudent ? 'bg-sp-accent/20 text-sp-accent' : 'bg-sp-surface/30'
                }`}
              >
                {student ? (
                  <span className="truncate max-w-full px-0.5">
                    {sizeMode === 'sm' ? student.name.charAt(0) : student.name}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

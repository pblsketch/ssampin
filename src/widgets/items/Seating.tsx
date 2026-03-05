import { useEffect, useMemo } from 'react';
import { useSeatingStore } from '@adapters/stores/useSeatingStore';
import { useStudentStore } from '@adapters/stores/useStudentStore';

/**
 * 자리배치 미니 위젯
 * 현재 좌석 배치를 축소 격자로 미리보기
 */
export function Seating() {
  const { seating, load } = useSeatingStore();
  const { students, load: loadStudents } = useStudentStore();

  useEffect(() => {
    void load();
    void loadStudents();
  }, [load, loadStudents]);

  const { rows, cols, seats } = seating;

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );

  const hasSeating = useMemo(() => {
    return seats.some((row) => row.some((cell) => cell !== null));
  }, [seats]);

  if (!hasSeating) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
        <div className="py-6 text-center text-sm text-sp-muted">
          자리배치가 설정되지 않았습니다
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col items-center gap-2">
      {/* 교탁 */}
      <div className="w-16 rounded bg-sp-border/30 py-0.5 text-center text-[10px] text-sp-muted">
        교탁
      </div>

      {/* 좌석 그리드 */}
      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        }}
      >
        {Array.from({ length: rows }).map((_, r) =>
          Array.from({ length: cols }).map((_, c) => {
            const studentId = seats[r]?.[c] ?? null;
            const student = studentId ? studentMap.get(studentId) : undefined;
            const hasStudent = studentId !== null;

            return (
              <div
                key={`${r}-${c}`}
                className={`h-5 w-5 rounded-sm text-[8px] flex items-center justify-center ${
                  hasStudent
                    ? 'bg-sp-accent/20 text-sp-accent'
                    : 'bg-sp-surface/30'
                }`}
              >
                {student ? (
                  <span className="truncate max-w-full px-0.5">
                    {student.name.charAt(0)}
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

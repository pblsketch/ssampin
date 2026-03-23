import { useState, useEffect, useRef, useMemo } from 'react';
import type { Student } from '@domain/entities/Student';

interface ShuffleOverlayProps {
  rows: number;
  cols: number;
  students: readonly Student[];
  finalSeats: readonly (readonly (string | null)[])[];
  onComplete: () => void;
}

export function ShuffleOverlay({
  rows,
  cols,
  students,
  finalSeats,
  onComplete,
}: ShuffleOverlayProps) {
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  const studentNames = useMemo(
    () => students.map((s) => s.name),
    [students],
  );

  type Phase = 'cycling' | 'locking' | 'done' | 'fadeout';
  const [phase, setPhase] = useState<Phase>('cycling');

  /* 빠르게 바뀌는 이름 그리드 */
  const [displayNames, setDisplayNames] = useState<string[][]>(() =>
    Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () =>
        studentNames[Math.floor(Math.random() * studentNames.length)] ?? '?',
      ),
    ),
  );

  /* 잠긴(확정된) 셀 */
  const [lockedSet, setLockedSet] = useState<Set<string>>(new Set());

  /* 타이머 관리 */
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  /* ── 1단계: 이름 빠르게 순환 ── */
  useEffect(() => {
    if (phase === 'done' || phase === 'fadeout') return;

    const speed = phase === 'cycling' ? 60 : 100;
    const interval = setInterval(() => {
      setDisplayNames((prev) =>
        prev.map((row, ri) =>
          row.map((_, ci) => {
            if (lockedSet.has(`${ri}-${ci}`)) return prev[ri]![ci]!;
            return (
              studentNames[Math.floor(Math.random() * studentNames.length)] ??
              '?'
            );
          }),
        ),
      );
    }, speed);

    return () => clearInterval(interval);
  }, [phase, lockedSet, studentNames]);

  /* ── cycling → locking 전환 (1.5초 후) ── */
  useEffect(() => {
    const t = setTimeout(() => setPhase('locking'), 1500);
    timersRef.current.push(t);
    return () => clearTimeout(t);
  }, []);

  /* ── 2단계: 대각선 순서로 한 칸씩 잠금 ── */
  useEffect(() => {
    if (phase !== 'locking') return;

    const cells: [number, number][] = [];
    for (let ri = 0; ri < rows; ri++) {
      for (let ci = 0; ci < cols; ci++) {
        cells.push([ri, ci]);
      }
    }
    /* 대각선 wave 패턴 정렬 */
    cells.sort((a, b) => {
      const da = a[0] + a[1];
      const db = b[0] + b[1];
      if (da !== db) return da - db;
      return a[1] - b[1];
    });

    cells.forEach(([ri, ci], idx) => {
      const t = setTimeout(() => {
        setLockedSet((prev) => {
          const next = new Set(prev);
          next.add(`${ri}-${ci}`);
          return next;
        });

        /* 마지막 셀 → done 전환 */
        if (idx === cells.length - 1) {
          const t2 = setTimeout(() => {
            setPhase('done');
            const t3 = setTimeout(() => {
              setPhase('fadeout');
              const t4 = setTimeout(onComplete, 500);
              timersRef.current.push(t4);
            }, 1000);
            timersRef.current.push(t3);
          }, 300);
          timersRef.current.push(t2);
        }
      }, idx * 60);
      timersRef.current.push(t);
    });
  }, [phase, rows, cols, onComplete]);

  const getStudentById = (id: string | null): Student | undefined => {
    if (!id) return undefined;
    return studentMap.get(id);
  };

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center transition-opacity duration-500 ${
        phase === 'fadeout' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* 배경 */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--sp-bg) 92%, transparent)' }} />

      {/* 콘텐츠 */}
      <div className="relative z-10 flex flex-col items-center w-full">
        {/* 헤더 */}
        <div className="mb-8 text-center">
          <div className="flex items-center gap-3 justify-center mb-3">
            {phase === 'done' || phase === 'fadeout' ? (
              <span className="material-symbols-outlined text-4xl text-green-400 shuffle-check-pop">
                check_circle
              </span>
            ) : (
              <span className="material-symbols-outlined text-4xl text-sp-accent shuffle-spin">
                shuffle
              </span>
            )}
            <h2 className="text-2xl font-bold text-sp-text">
              {phase === 'done' || phase === 'fadeout'
                ? '자리 배치 완료!'
                : '자리 바꾸는 중...'}
            </h2>
          </div>
          <p
            className={`text-sm transition-all duration-300 ${
              phase === 'cycling'
                ? 'text-sp-highlight animate-pulse text-base font-bold'
                : phase === 'locking'
                  ? 'text-sp-accent'
                  : 'text-green-400 font-medium'
            }`}
          >
            {phase === 'cycling'
              ? '두근두근...'
              : phase === 'locking'
                ? '자리가 정해지고 있어요!'
                : '새로운 자리에서 잘 지내세요!'}
          </p>
        </div>

        {/* 좌석 그리드 */}
        <div
          className="w-full max-w-4xl mx-auto px-8"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap: '0.75rem',
          }}
        >
          {Array.from({ length: rows }, (_, ri) =>
            Array.from({ length: cols }, (_, ci) => {
              const key = `${ri}-${ci}`;
              const isLocked = lockedSet.has(key);
              const finalId = finalSeats[ri]?.[ci] ?? null;
              const finalStudent = getStudentById(finalId);
              const isEmpty = isLocked && finalId === null;
              const displayName = displayNames[ri]?.[ci] ?? '?';

              return (
                <div
                  key={key}
                  className={`
                    relative rounded-lg border p-3 flex flex-col items-center justify-center min-h-[68px] transition-all duration-300
                    ${
                      isEmpty
                        ? 'border-sp-border/30 bg-sp-card/30'
                        : isLocked
                          ? 'border-sp-accent bg-sp-card shadow-[0_0_20px_color-mix(in_srgb,var(--sp-accent)_40%,transparent)] shuffle-lock-in'
                          : 'border-sp-border/40 bg-sp-card/40 shuffle-cycling'
                    }
                    ${phase === 'done' && !isEmpty && isLocked ? 'shuffle-celebrate' : ''}
                  `}
                >
                  {isEmpty ? (
                    <span className="text-xs text-sp-muted/50">빈 자리</span>
                  ) : isLocked ? (
                    <>
                      {finalStudent?.studentNumber !== undefined && (
                        <span className="text-caption font-mono text-sp-accent font-bold">
                          {String(finalStudent.studentNumber).padStart(2, '0')}
                        </span>
                      )}
                      <span className="text-sm font-bold text-sp-text">
                        {finalStudent?.name ?? ''}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm font-medium text-sp-muted/80">
                      {displayName}
                    </span>
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}

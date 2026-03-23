import { useState, useEffect, useRef, useMemo } from 'react';
import type { Student } from '@domain/entities/Student';
import type { SeatGroup } from '@domain/entities/Seating';

interface GroupShuffleOverlayProps {
  groups: readonly SeatGroup[];
  students: readonly Student[];
  onComplete: () => void;
}

export function GroupShuffleOverlay({
  groups,
  students,
  onComplete,
}: GroupShuffleOverlayProps) {
  const studentMap = useMemo(() => {
    const map = new Map<string, Student>();
    for (const s of students) map.set(s.id, s);
    return map;
  }, [students]);

  const studentNames = useMemo(
    () => students.filter((s) => !s.isVacant).map((s) => s.name),
    [students],
  );

  type Phase = 'cycling' | 'locking' | 'done' | 'fadeout';
  const [phase, setPhase] = useState<Phase>('cycling');

  // 각 모둠별 표시 이름 (cycling 중 랜덤 변경)
  const [displayNames, setDisplayNames] = useState<string[][]>(() =>
    groups.map((g) =>
      g.studentIds.map(
        () => studentNames[Math.floor(Math.random() * studentNames.length)] ?? '?',
      ),
    ),
  );

  // 잠긴(확정된) 슬롯: "groupIdx-slotIdx"
  const [lockedSet, setLockedSet] = useState<Set<string>>(new Set());

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    return () => {
      for (const t of timersRef.current) clearTimeout(t);
    };
  }, []);

  // 1단계: 이름 빠르게 순환
  useEffect(() => {
    if (phase === 'done' || phase === 'fadeout') return;

    const speed = phase === 'cycling' ? 60 : 100;
    const interval = setInterval(() => {
      setDisplayNames((prev) =>
        prev.map((groupNames, gi) =>
          groupNames.map((_, si) => {
            if (lockedSet.has(`${gi}-${si}`)) return prev[gi]![si]!;
            return (
              studentNames[Math.floor(Math.random() * studentNames.length)] ?? '?'
            );
          }),
        ),
      );
    }, speed);

    return () => clearInterval(interval);
  }, [phase, lockedSet, studentNames]);

  // cycling → locking 전환 (1.5초 후)
  useEffect(() => {
    const t = setTimeout(() => setPhase('locking'), 1500);
    timersRef.current.push(t);
    return () => clearTimeout(t);
  }, []);

  // 2단계: 모둠별 순서로 한 칸씩 잠금
  useEffect(() => {
    if (phase !== 'locking') return;

    // 모둠 → 슬롯 순서로 잠금 (모둠 간 교차)
    const cells: [number, number][] = [];
    const maxLen = Math.max(...groups.map((g) => g.studentIds.length), 0);
    for (let si = 0; si < maxLen; si++) {
      for (let gi = 0; gi < groups.length; gi++) {
        if (si < groups[gi]!.studentIds.length) {
          cells.push([gi, si]);
        }
      }
    }

    cells.forEach(([gi, si], idx) => {
      const t = setTimeout(() => {
        setLockedSet((prev) => {
          const next = new Set(prev);
          next.add(`${gi}-${si}`);
          return next;
        });

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
      }, idx * 80);
      timersRef.current.push(t);
    });
  }, [phase, groups, onComplete]);

  const getStudent = (id: string): Student | undefined => studentMap.get(id);

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
                ? '모둠 배치 완료!'
                : '모둠 자리 바꾸는 중...'}
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
              ? '어떤 모둠이 될까?'
              : phase === 'locking'
                ? '모둠원이 정해지고 있어요!'
                : '새 모둠에서 잘 지내세요!'}
          </p>
        </div>

        {/* 모둠 카드 그리드 */}
        <div className="w-full max-w-5xl mx-auto px-8 grid grid-cols-2 lg:grid-cols-3 gap-5">
          {groups.map((group, gi) => (
            <div
              key={group.id}
              className="rounded-2xl border-2 p-4 min-h-[160px] transition-all duration-300"
              style={{
                borderColor: group.color + '60',
                background: group.color + '08',
              }}
            >
              {/* 모둠 헤더 */}
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ background: group.color }}
                />
                <span className="text-sm font-bold text-sp-text">{group.name}</span>
                <span className="text-[10px] text-sp-muted">
                  {group.studentIds.length}명
                </span>
              </div>

              {/* 학생 슬롯 */}
              <div className="flex flex-wrap gap-3 justify-center">
                {group.studentIds.map((sid, si) => {
                  const key = `${gi}-${si}`;
                  const isLocked = lockedSet.has(key);
                  const student = getStudent(sid);
                  const displayName = displayNames[gi]?.[si] ?? '?';

                  return (
                    <div
                      key={key}
                      className="flex flex-col items-center gap-1"
                      style={{ minWidth: '3.5rem' }}
                    >
                      {/* 원형 아바타 */}
                      <div
                        className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                          isLocked
                            ? 'text-sp-text shuffle-lock-in'
                            : 'text-sp-muted/80 shuffle-cycling'
                        } ${phase === 'done' && isLocked ? 'shuffle-celebrate' : ''}`}
                        style={{
                          borderColor: isLocked ? group.color : group.color + '40',
                          background: isLocked ? group.color + '18' : group.color + '08',
                        }}
                      >
                        {isLocked
                          ? (student?.name?.charAt(0) ?? '?')
                          : (displayName.charAt(0) ?? '?')}
                      </div>
                      {/* 이름 */}
                      <span
                        className={`text-[11px] leading-tight transition-all duration-300 ${
                          isLocked
                            ? 'text-sp-text font-medium'
                            : 'text-sp-muted/60'
                        }`}
                      >
                        {isLocked ? (student?.name ?? '') : displayName}
                      </span>
                      {/* 번호 (잠금 시) */}
                      {isLocked && student?.studentNumber !== undefined && (
                        <span className="text-[9px] text-sp-muted font-mono">
                          {String(student.studentNumber).padStart(2, '0')}번
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

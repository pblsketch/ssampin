import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FocusTrap } from 'focus-trap-react';
import type { SeatingData } from '@domain/entities/Seating';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { LearningCard } from './LearningCard';

type LearningMode = 'free' | 'sequential' | 'quiz';

/** 카드에 표시할 최소 학생 정보. ClassSeatingTab(studentKey) ↔ Seating(student.id) 양쪽 호환. */
export interface LearningStudentInfo {
  studentNumber?: number;
  name: string;
}

interface NameLearningModeProps {
  isOpen: boolean;
  onClose: () => void;
  seating: SeatingData;
  /**
   * 좌석 셀의 studentId(또는 studentKey)로 학생 정보를 조회.
   * 미지정 시 useStudentStore.getStudent 를 사용 (담임 자리배치 기본 동작).
   */
  resolveStudent?: (id: string) => LearningStudentInfo | undefined;
}

interface SeatPos {
  row: number;
  col: number;
  studentId: string;
}

/** seats 2D → { row, col, studentId }[] (학생 있는 좌석만) */
function flattenSeats(seats: SeatingData['seats']): SeatPos[] {
  const list: SeatPos[] = [];
  seats.forEach((row, r) => {
    row.forEach((id, c) => {
      if (id) list.push({ row: r, col: c, studentId: id });
    });
  });
  return list;
}

/**
 * 이름 학습 모드 — 자리 그리드 위에 학생 이름을 가리고 익히는 전체화면 오버레이.
 *
 * 3가지 모드:
 * - free: 자유 클릭 — 원하는 카드 아무거나 클릭해서 공개
 * - sequential: 순서대로 — 학번 순서로 한 명씩 자동 강조, 클릭 시 공개
 * - quiz: 랜덤 퀴즈 — 랜덤 카드 강조, [정답 확인] 클릭 시 공개, [맞춤]/[틀림] 자가 채점
 *
 * 키보드: ESC=종료, Tab=카드 순회, Enter/Space=현재 카드 플립
 * ARIA: role="dialog", aria-modal="true", aria-live 영역으로 진행률 알림
 */
export function NameLearningMode({
  isOpen,
  onClose,
  seating,
  resolveStudent,
}: NameLearningModeProps) {
  const getStudentFromStore = useStudentStore((s) => s.getStudent);
  // resolveStudent prop이 있으면 그것을 사용, 없으면 useStudentStore 기본 동작
  const getStudent = useCallback(
    (id: string | null): LearningStudentInfo | undefined => {
      if (id == null) return undefined;
      if (resolveStudent) return resolveStudent(id);
      const stored = getStudentFromStore(id);
      return stored ? { studentNumber: stored.studentNumber, name: stored.name } : undefined;
    },
    [resolveStudent, getStudentFromStore],
  );

  const seatList = useMemo(() => flattenSeats(seating.seats), [seating.seats]);
  const total = seatList.length;

  const [mode, setMode] = useState<LearningMode>('free');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState<number>(0); // sequential / quiz 의 현재 학생 index (seatList 기준)
  const [answers, setAnswers] = useState<Map<string, boolean>>(new Map());
  const [quizPhase, setQuizPhase] = useState<'asking' | 'revealed'>('asking');
  const [startTime, setStartTime] = useState<number>(() => Date.now());

  const previousOverflowRef = useRef<string>('');

  // 닫힐 때 body scroll 복원
  useEffect(() => {
    if (!isOpen) return;
    previousOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflowRef.current;
      window.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, onClose]);

  // 패널이 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      setMode('free');
      setRevealed(new Set());
      setCurrentIndex(0);
      setAnswers(new Map());
      setQuizPhase('asking');
      setStartTime(Date.now());
    }
  }, [isOpen]);

  // sequential 모드: 학번 순서로 currentIndex 자동 진행
  const sortedSeatList = useMemo(() => {
    // 학번 순으로 정렬 (학번 없으면 끝으로)
    return [...seatList].sort((a, b) => {
      const numA = getStudent(a.studentId)?.studentNumber ?? Number.MAX_SAFE_INTEGER;
      const numB = getStudent(b.studentId)?.studentNumber ?? Number.MAX_SAFE_INTEGER;
      return numA - numB;
    });
  }, [seatList, getStudent]);

  const handleCardClick = useCallback(
    (studentId: string, index: number) => {
      if (mode === 'free') {
        setRevealed((prev) => {
          const next = new Set(prev);
          if (next.has(studentId)) next.delete(studentId);
          else next.add(studentId);
          return next;
        });
      } else if (mode === 'sequential') {
        // sequential: 현재 강조된 카드만 클릭 가능
        const currentSeat = sortedSeatList[currentIndex];
        if (currentSeat && currentSeat.studentId === studentId) {
          setRevealed((prev) => new Set([...prev, studentId]));
          // 다음으로 진행 (마지막이면 그대로)
          if (currentIndex + 1 < sortedSeatList.length) {
            setTimeout(() => setCurrentIndex((i) => i + 1), 600);
          }
        }
      } else if (mode === 'quiz') {
        // quiz: 현재 강조된 카드만, 1회 클릭으로 공개 단계로 이동
        const currentSeat = seatList[index];
        if (currentSeat && currentSeat.studentId === studentId && quizPhase === 'asking') {
          setQuizPhase('revealed');
          setRevealed((prev) => new Set([...prev, studentId]));
        }
      }
    },
    [mode, sortedSeatList, currentIndex, seatList, quizPhase],
  );

  const revealAll = useCallback(() => {
    setRevealed(new Set(seatList.map((s) => s.studentId)));
  }, [seatList]);

  const hideAll = useCallback(() => {
    setRevealed(new Set());
    setAnswers(new Map());
    setQuizPhase('asking');
  }, []);

  const resetSession = useCallback(() => {
    setRevealed(new Set());
    setCurrentIndex(0);
    setAnswers(new Map());
    setQuizPhase('asking');
    setStartTime(Date.now());
  }, []);

  // quiz 모드: "맞춤"/"틀림" 자가 채점 후 다음 문제
  const recordAnswer = useCallback(
    (correct: boolean) => {
      const currentSeat = seatList[currentIndex];
      if (!currentSeat) return;
      setAnswers((prev) => {
        const next = new Map(prev);
        next.set(currentSeat.studentId, correct);
        return next;
      });
      // 다음 랜덤 카드로 (이미 푼 카드는 제외)
      const remaining = seatList
        .map((_, i) => i)
        .filter((i) => i !== currentIndex && !answers.has(seatList[i]!.studentId));
      if (remaining.length > 0) {
        const nextIdx = remaining[Math.floor(Math.random() * remaining.length)]!;
        setCurrentIndex(nextIdx);
        setQuizPhase('asking');
      }
    },
    [currentIndex, seatList, answers],
  );

  if (!isOpen) return null;

  const revealedCount = revealed.size;
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  const correctCount = [...answers.values()].filter((v) => v).length;
  const answeredCount = answers.size;

  const currentSeqSeat = mode === 'sequential' ? sortedSeatList[currentIndex] : null;
  const currentQuizSeat = mode === 'quiz' ? seatList[currentIndex] : null;
  const currentQuizStudent = currentQuizSeat ? getStudent(currentQuizSeat.studentId) : null;

  // sequential / quiz 강조 대상 학생 ID
  const highlightedStudentId =
    mode === 'sequential'
      ? (currentSeqSeat?.studentId ?? null)
      : mode === 'quiz'
        ? (currentQuizSeat?.studentId ?? null)
        : null;

  return (
    <FocusTrap
      focusTrapOptions={{
        escapeDeactivates: false,
        clickOutsideDeactivates: false,
        returnFocusOnDeactivate: true,
        fallbackFocus: '[data-learning-fallback]',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="이름 학습 모드"
        data-learning-fallback
        tabIndex={-1}
        className="absolute inset-0 z-30 bg-sp-bg/95 backdrop-blur-sm flex flex-col"
      >
        {/* 헤더: 진행률 + 모드 + 종료 */}
        <header className="shrink-0 border-b border-sp-border bg-sp-surface/60 px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent" aria-hidden="true">
              quiz
            </span>
            <h2 className="text-lg font-bold text-sp-text">이름 학습</h2>
          </div>

          {/* 모드 선택 */}
          <div role="radiogroup" aria-label="학습 모드" className="flex gap-1 ml-2">
            {(
              [
                { value: 'free', label: '자유' },
                { value: 'sequential', label: '순서' },
                { value: 'quiz', label: '퀴즈' },
              ] as ReadonlyArray<{ value: LearningMode; label: string }>
            ).map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setMode(opt.value);
                    resetSession();
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-sp-accent text-white'
                      : 'bg-sp-card text-sp-text hover:bg-sp-text/5 ring-1 ring-sp-border'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* 진행률 (aria-live 로 스크린리더에도 안내) */}
          <div aria-live="polite" aria-atomic="true" className="text-sm text-sp-muted ml-auto">
            {mode === 'quiz' ? (
              <span>
                {answeredCount}/{total}명 풀이 · 정답 {correctCount}
              </span>
            ) : (
              <span>
                {revealedCount}/{total}명 공개
              </span>
            )}
            <span className="ml-3 text-xs">{elapsedSeconds}초</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-text/5 text-sm text-sp-text ring-1 ring-sp-border flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base">close</span>
            <span>종료</span>
          </button>
        </header>

        {/* 자리 그리드 */}
        <div className="flex-1 overflow-auto p-6 flex items-start justify-center">
          {total === 0 ? (
            <div className="text-center py-16 text-sp-muted">
              <span className="material-symbols-outlined text-3xl block mb-2 opacity-60">
                people
              </span>
              <p>학습할 학생이 없습니다.</p>
            </div>
          ) : (
            <div
              className="grid gap-2 max-w-5xl w-full"
              style={{
                gridTemplateColumns: `repeat(${seating.cols}, minmax(0, 1fr))`,
              }}
            >
              {Array.from({ length: seating.rows }).map((_, r) =>
                Array.from({ length: seating.cols }).map((_, c) => {
                  const studentId = seating.seats[r]?.[c] ?? null;
                  if (!studentId) {
                    return (
                      <div
                        key={`${r}-${c}`}
                        className="min-h-[88px] rounded-xl border-2 border-dashed border-sp-border/40 bg-sp-card/30"
                        aria-hidden="true"
                      />
                    );
                  }
                  const student = getStudent(studentId);
                  const isRevealed = revealed.has(studentId);
                  const seatIndex = seatList.findIndex((s) => s.studentId === studentId);
                  const answerEntry = answers.get(studentId);
                  const answerState =
                    answerEntry === undefined ? undefined : answerEntry ? 'correct' : 'wrong';

                  return (
                    <LearningCard
                      key={`${r}-${c}`}
                      row={r}
                      col={c}
                      studentNumber={student?.studentNumber}
                      studentName={student?.name ?? '?'}
                      revealed={isRevealed}
                      highlighted={highlightedStudentId === studentId}
                      answerState={answerState}
                      onClick={() => handleCardClick(studentId, seatIndex)}
                    />
                  );
                }),
              )}
            </div>
          )}
        </div>

        {/* 하단 컨트롤 */}
        <footer className="shrink-0 border-t border-sp-border bg-sp-surface/60 px-6 py-3 flex items-center gap-2 flex-wrap">
          {mode === 'quiz' && quizPhase === 'revealed' && currentQuizStudent && (
            <>
              <span className="text-sm text-sp-text mr-2">
                정답:{' '}
                <strong className="text-sp-accent">
                  {currentQuizStudent.studentNumber !== undefined
                    ? `${currentQuizStudent.studentNumber}번 `
                    : ''}
                  {currentQuizStudent.name}
                </strong>
              </span>
              <button
                type="button"
                onClick={() => recordAnswer(true)}
                className="px-3 py-1.5 rounded-md bg-green-500/20 text-green-300 hover:bg-green-500/30 text-sm font-medium"
              >
                맞춤
              </button>
              <button
                type="button"
                onClick={() => recordAnswer(false)}
                className="px-3 py-1.5 rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/30 text-sm font-medium"
              >
                틀림
              </button>
            </>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={revealAll}
              className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-text/5 text-sm text-sp-text ring-1 ring-sp-border"
            >
              전체 공개
            </button>
            <button
              type="button"
              onClick={hideAll}
              className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-text/5 text-sm text-sp-text ring-1 ring-sp-border"
            >
              전체 숨김
            </button>
            <button
              type="button"
              onClick={resetSession}
              className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-text/5 text-sm text-sp-text ring-1 ring-sp-border"
            >
              리셋
            </button>
          </div>
        </footer>
      </div>
    </FocusTrap>
  );
}

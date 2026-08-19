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
  const [quizPhase, setQuizPhase] = useState<'asking' | 'revealed' | 'scored'>('asking');
  const [quizFinished, setQuizFinished] = useState(false);
  const [startTime, setStartTime] = useState<number>(() => Date.now());
  const [elapsedAtFinish, setElapsedAtFinish] = useState<number>(0);

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

  /**
   * 세션 초기화 — 시작 지점이 모드마다 다르다.
   * currentIndex 를 sequential 과 quiz 가 공유하므로 무조건 0(또는 무조건 랜덤)으로 두면
   * 한쪽이 망가진다: 랜덤으로 통일하면 "순서" 모드가 3번 학생부터 시작하고,
   * 0으로 통일하면 "맞혀보기" 첫 문제가 항상 같은 학생이 된다.
   */
  const startSession = useCallback(
    (nextMode: LearningMode) => {
      setRevealed(new Set());
      setAnswers(new Map());
      setQuizPhase('asking');
      setQuizFinished(false);
      setElapsedAtFinish(0);
      setStartTime(Date.now());
      setCurrentIndex(
        nextMode === 'quiz' && seatList.length > 0
          ? Math.floor(Math.random() * seatList.length)
          : 0,
      );
    },
    [seatList.length],
  );

  // 패널이 열릴 때마다 초기화
  useEffect(() => {
    if (isOpen) {
      setMode('free');
      startSession('free');
    }
  }, [isOpen, startSession]);

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
    (studentId: string) => {
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
        // quiz: 강조된 카드만 반응한다.
        // ⚠️ 이전 구현은 seatList[index] 와 비교했는데 index 가 곧 그 studentId 의 인덱스라
        //    조건이 항상 참이었다 → 아무 카드나 열리는데 채점은 seatList[currentIndex](강조된 학생)에
        //    기록되어 "엉뚱한 카드를 열었는데 다른 학생이 정답으로 뜨는" 불일치가 생겼다.
        //    sequential 과 동일하게 currentIndex 기준으로 막는다.
        const currentSeat = seatList[currentIndex];
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
    setQuizFinished(false);
  }, []);

  const resetSession = useCallback(() => startSession(mode), [startSession, mode]);

  // quiz 모드: "맞춤"/"틀림" 자가 채점.
  // ⚠️ 여기서 다음 문제를 고르지 않는다 — 이전 구현은 answers 클로저(채점 반영 전 값)를 읽어
  //    remaining 이 한 틱 늦었고, 그래서 마지막 1명이 출제되지 않은 채 화면이 멈췄다.
  //    채점만 기록하고 'scored' 로 넘긴 뒤, 반영된 answers 를 보는 effect 가 다음 문제를 정한다.
  const recordAnswer = useCallback(
    (correct: boolean) => {
      const currentSeat = seatList[currentIndex];
      if (!currentSeat) return;
      setAnswers((prev) => new Map(prev).set(currentSeat.studentId, correct));
      setQuizPhase('scored');
    },
    [currentIndex, seatList],
  );

  // quiz 모드: 채점이 반영된 뒤 다음 문제를 고르거나, 남은 문제가 없으면 결과 요약으로 넘어간다
  useEffect(() => {
    if (mode !== 'quiz' || quizPhase !== 'scored') return;
    const remaining = seatList.map((_, i) => i).filter((i) => !answers.has(seatList[i]!.studentId));
    if (remaining.length === 0) {
      setElapsedAtFinish(Math.floor((Date.now() - startTime) / 1000));
      setQuizFinished(true);
      return;
    }
    setCurrentIndex(remaining[Math.floor(Math.random() * remaining.length)]!);
    setQuizPhase('asking');
  }, [mode, quizPhase, answers, seatList, startTime]);

  if (!isOpen) return null;

  const revealedCount = revealed.size;
  const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
  const correctCount = [...answers.values()].filter((v) => v).length;
  const answeredCount = answers.size;
  // 결과 요약용 — 틀린 학생을 학번 순으로 모은다(다음에 뭘 더 외워야 하는지가 요약의 핵심)
  const wrongNames = quizFinished
    ? sortedSeatList
        .filter((s) => answers.get(s.studentId) === false)
        .map((s) => getStudent(s.studentId)?.name ?? '?')
    : [];

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
                { value: 'quiz', label: '맞혀보기' },
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
                    // ⚠️ resetSession() 이 아니라 새 모드를 직접 넘긴다 —
                    //    setMode 는 비동기라 resetSession 은 아직 이전 모드를 보고 초기화한다.
                    startSession(opt.value);
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
        <div className="flex-1 overflow-auto p-6 flex flex-col items-center gap-4">
          {/* 맞혀보기 결과 요약 — 마지막 문제까지 채점하면 나타난다.
              (이전에는 마지막 문제를 풀어도 화면이 그대로 멈춰 있어 끝났다는 신호가 없었다) */}
          {quizFinished && (
            <section
              aria-live="polite"
              className="w-full max-w-5xl rounded-xl bg-sp-card ring-1 ring-sp-border px-5 py-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="material-symbols-outlined text-sp-accent" aria-hidden="true">
                  check_circle
                </span>
                <h3 className="text-base font-bold text-sp-text">
                  {total}명 중 {correctCount}명 맞혔어요
                </h3>
                <span className="text-sm text-sp-muted">{elapsedAtFinish}초 걸렸습니다</span>
                <button
                  type="button"
                  onClick={resetSession}
                  className="ml-auto px-3 py-1.5 rounded-md bg-sp-accent text-white text-sm font-medium"
                >
                  다시 하기
                </button>
              </div>
              {wrongNames.length > 0 && (
                <p className="mt-3 text-sm text-sp-text break-keep">
                  <span className="text-sp-muted">아직 못 외운 학생 {wrongNames.length}명 · </span>
                  {wrongNames.join(', ')}
                </p>
              )}
            </section>
          )}

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
                      onClick={() => handleCardClick(studentId)}
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

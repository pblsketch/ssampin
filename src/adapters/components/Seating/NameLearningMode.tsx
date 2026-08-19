import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FocusTrap } from 'focus-trap-react';
import type { SeatingData } from '@domain/entities/Seating';
import { useStudentStore } from '@adapters/stores/useStudentStore';
import { gradeNameAnswer, acceptedNamesFor, toChosungHint } from '@domain/rules/nameAnswerGrading';
import { LearningCard } from './LearningCard';
import { FEATURE_FLAGS } from '@adapters/config/featureFlags';

type LearningMode = 'free' | 'sequential' | 'quiz' | 'write';

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
  /**
   * studentId → 얼굴 사진 URL(objectURL 등). 그리드 카드와 "이름 쓰기" 모드의 큰 카드에 함께 쓰인다.
   *
   * ⚠️ 이 컴포넌트는 사진 저장소를 직접 부르지 않는다 — 사진 바이트가 화면에 들어오는 관문을
   * 한 곳(호출부)으로 좁혀 위젯·학생 화면 노출을 막기 위함이다. 그래서 URL 은 항상
   * **호출부에서 만들고**(예: `URL.createObjectURL`), 이 모드가 닫히거나 언마운트될 때
   * **호출부에서 `URL.revokeObjectURL` 로 해제**해야 한다. 이 컴포넌트는 해제 시점을 모른다.
   */
  photoUrls?: ReadonlyMap<string, string>;
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
 * 4가지 모드:
 * - free: 자유 클릭 — 원하는 카드 아무거나 클릭해서 공개
 * - sequential: 순서대로 — 학번 순서로 한 명씩 자동 강조, 클릭 시 공개
 * - quiz: 랜덤 퀴즈 — 랜덤 카드 강조, [정답 확인] 클릭 시 공개, [맞춤]/[틀림] 자가 채점
 * - write: 이름 쓰기 — 사진 한 장만 보고 이름을 직접 입력, 자동 채점(재시도 없음).
 *   사진이 등록된 학생이 한 명도 없으면 이 모드는 쓸 수 없다(라디오 비활성).
 *
 * 키보드: ESC=종료, Tab=카드 순회, Enter/Space=현재 카드 플립
 * ARIA: role="dialog", aria-modal="true", aria-live 영역으로 진행률 알림
 */
export function NameLearningMode({
  isOpen,
  onClose,
  seating,
  resolveStudent,
  photoUrls,
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

  // "이름 쓰기" 모드는 사진이 있는 학생만 문제로 낼 수 있다 —
  // 사진이 없으면 "얼굴 보고 이름 맞히기"라는 모드의 목적 자체가 성립하지 않는다.
  const photoSeatList = useMemo(
    () => (photoUrls ? seatList.filter((s) => photoUrls.has(s.studentId)) : []),
    [seatList, photoUrls],
  );
  const canUseWrite = photoSeatList.length > 0;

  const [mode, setMode] = useState<LearningMode>('free');
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [currentIndex, setCurrentIndex] = useState<number>(0); // sequential / quiz 의 현재 학생 index (seatList 기준)
  const [answers, setAnswers] = useState<Map<string, boolean>>(new Map());
  const [quizPhase, setQuizPhase] = useState<'asking' | 'revealed' | 'scored'>('asking');
  const [quizFinished, setQuizFinished] = useState(false);
  const [startTime, setStartTime] = useState<number>(() => Date.now());
  const [elapsedAtFinish, setElapsedAtFinish] = useState<number>(0);

  // "이름 쓰기" 모드 전용 상태. currentIndex 를 재사용하지 않는다 —
  // write 는 sortedSeatList/seatList 가 아니라 사진이 있는 학생만의 별도 목록(writePool)을
  // 도는데, 인덱스를 공유하면 "순서/맞혀보기 인덱스 공유" 함정과 같은 종류의 버그가 난다.
  // studentId 를 직접 들고 다니면 어느 목록 기준인지 헷갈릴 일이 없다.
  const [writePool, setWritePool] = useState<SeatPos[]>([]);
  const [writeAnswers, setWriteAnswers] = useState<Map<string, boolean>>(new Map());
  const [writeCurrentId, setWriteCurrentId] = useState<string | null>(null);
  const [writePhase, setWritePhase] = useState<'asking' | 'graded'>('asking');
  const [writeInputValue, setWriteInputValue] = useState('');
  const [writeHintShown, setWriteHintShown] = useState(false);
  const [writeFinished, setWriteFinished] = useState(false);

  // 한글 입력 조합 추적 — compositionstart~compositionend 사이에는 Enter 를 제출로 보지 않는다.
  const isComposingRef = useRef(false);
  const writeInputRef = useRef<HTMLInputElement>(null);
  const writeNextButtonRef = useRef<HTMLButtonElement>(null);

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
   * write 는 currentIndex 를 아예 안 쓰므로 이 셈에서 자유롭다.
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

      if (nextMode === 'write') {
        const pool = photoSeatList;
        setWritePool(pool);
        setWriteAnswers(new Map());
        setWriteFinished(false);
        setWritePhase('asking');
        setWriteInputValue('');
        setWriteHintShown(false);
        setWriteCurrentId(
          pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)]!.studentId : null,
        );
      }
    },
    [seatList.length, photoSeatList],
  );

  // 항상 최신 startSession 을 가리키는 참조 — 아래 초기화 effect 가 함수 신원 변화에
  // 휘둘리지 않게 하기 위한 것이다(이유는 그 effect 주석 참조).
  const startSessionRef = useRef(startSession);
  startSessionRef.current = startSession;

  // 패널이 열릴 때만 초기화한다.
  //
  // ⚠️ 의존성에 startSession 을 넣으면 안 된다.
  //    사진은 비동기로 로드되므로 학습 모드를 연 뒤 잠시 뒤에 photoUrls 가 채워지는데,
  //    그러면 photoSeatList → startSession 순으로 신원이 바뀌어 이 effect 가 다시 돈다.
  //    결과: 사용자가 이미 [맞혀보기]로 몇 문제를 풀고 있는데 **사진 로딩이 끝나는 순간
  //    모드가 '자유'로 되돌아가고 진행 상황이 전부 초기화**된다. 사진이 많을수록 잘 재현된다.
  useEffect(() => {
    if (!isOpen) return;
    setMode('free');
    startSessionRef.current('free');
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

  // write 모드: 답 채점.
  // ⚠️ quiz 의 "맞춤/틀림"과 달리 여기는 앱이 gradeNameAnswer 로 자동 채점한다.
  //    재시도는 없다(오너 확정) — 채점 즉시 'graded' 로 넘어가고, 다음 문제는
  //    사람이 "다음" 을 눌러야 진행된다(정답을 읽을 시간을 주기 위해 자동 진행하지 않는다).
  const submitWriteAnswer = useCallback(
    (gaveUp: boolean) => {
      if (!writeCurrentId || writePhase !== 'asking') return;
      const student = getStudent(writeCurrentId);
      if (!student) return;
      const allNames = seatList
        .map((s) => getStudent(s.studentId)?.name)
        .filter((n): n is string => Boolean(n));
      const accepted = acceptedNamesFor(student.name, allNames);
      const verdict = gaveUp ? 'wrong' : gradeNameAnswer(writeInputValue, student.name, accepted);
      setWriteAnswers((prev) => new Map(prev).set(writeCurrentId, verdict === 'correct'));
      setWritePhase('graded');
    },
    [writeCurrentId, writePhase, getStudent, seatList, writeInputValue],
  );

  // write 모드: 다음 문제로 진행하거나, 다 풀었으면 결과 요약으로 넘어간다.
  // "다음" 버튼(또는 그 버튼에 포커스가 간 상태의 Enter) 을 눌러야 호출된다 —
  // 클릭 시점엔 writeAnswers 가 이미 리렌더로 반영돼 있어 quiz 처럼 effect 로 미룰 필요가 없다.
  const advanceWriteQuestion = useCallback(() => {
    const remaining = writePool.filter((s) => !writeAnswers.has(s.studentId));
    if (remaining.length === 0) {
      setElapsedAtFinish(Math.floor((Date.now() - startTime) / 1000));
      setWriteFinished(true);
      setWriteCurrentId(null);
      return;
    }
    const next = remaining[Math.floor(Math.random() * remaining.length)]!;
    setWriteCurrentId(next.studentId);
    setWriteInputValue('');
    setWriteHintShown(false);
    setWritePhase('asking');
  }, [writePool, writeAnswers, startTime]);

  // write 모드: 한 바퀴를 다 돈 뒤, 틀렸던 학생만 모아 새 라운드를 시작한다.
  const retryWrongOnly = useCallback(() => {
    const wrongSeats = writePool.filter((s) => writeAnswers.get(s.studentId) === false);
    if (wrongSeats.length === 0) return;
    setWritePool(wrongSeats);
    setWriteAnswers(new Map());
    setWriteFinished(false);
    setStartTime(Date.now());
    setElapsedAtFinish(0);
    const next = wrongSeats[Math.floor(Math.random() * wrongSeats.length)]!;
    setWriteCurrentId(next.studentId);
    setWriteInputValue('');
    setWriteHintShown(false);
    setWritePhase('asking');
  }, [writePool, writeAnswers]);

  // write 모드: 새 문제로 넘어갈 때 입력칸에 자동 포커스
  useEffect(() => {
    if (isOpen && mode === 'write' && writePhase === 'asking') {
      writeInputRef.current?.focus();
    }
  }, [isOpen, mode, writePhase, writeCurrentId]);

  // write 모드: 채점 직후 "다음" 버튼에 자동 포커스 (Enter 로 바로 다음 문제로)
  useEffect(() => {
    if (isOpen && mode === 'write' && writePhase === 'graded') {
      writeNextButtonRef.current?.focus();
    }
  }, [isOpen, mode, writePhase]);

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

  // write 모드 파생값
  const writeCorrectCount = [...writeAnswers.values()].filter(Boolean).length;
  const currentWriteStudent = writeCurrentId ? getStudent(writeCurrentId) : null;
  const currentWriteVerdict = writeCurrentId ? writeAnswers.get(writeCurrentId) : undefined;
  const writeAnswerState: 'correct' | 'wrong' | undefined =
    writePhase === 'graded' ? (currentWriteVerdict ? 'correct' : 'wrong') : undefined;
  // 결과 요약용 — 틀린 학생을 학번 순으로 모은다
  const writeWrongSeats = writeFinished
    ? [...writePool]
        .filter((s) => writeAnswers.get(s.studentId) === false)
        .sort(
          (a, b) =>
            (getStudent(a.studentId)?.studentNumber ?? Number.MAX_SAFE_INTEGER) -
            (getStudent(b.studentId)?.studentNumber ?? Number.MAX_SAFE_INTEGER),
        )
    : [];
  const writeWrongNames = writeWrongSeats.map((s) => getStudent(s.studentId)?.name ?? '?');

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
        className="absolute inset-0 z-30 bg-sp-bg backdrop-blur-sm flex flex-col"
      >
        {/* 헤더: 진행률 + 모드 + 종료 */}
        <header className="shrink-0 border-b border-sp-border bg-sp-surface px-6 py-3 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sp-accent" aria-hidden="true">
              quiz
            </span>
            <h2 className="text-lg font-bold text-sp-text">이름 학습</h2>
          </div>

          {/* 모드 선택 */}
          <div role="radiogroup" aria-label="학습 모드" className="flex items-center gap-1 ml-2">
            {(
              [
                { value: 'free', label: '자유' },
                { value: 'sequential', label: '순서' },
                { value: 'quiz', label: '맞혀보기' },
                // 이름 쓰기는 얼굴 사진이 있어야 성립한다. 사진 기능 출시 보류 중에는
                // 항목 자체를 숨긴다 — 남겨 두면 "사진을 등록하세요" 안내만 뜨는,
                // 영영 눌리지 않는 버튼이 된다.
                ...(FEATURE_FLAGS.studentPhotos
                  ? [{ value: 'write' as const, label: '이름 쓰기' }]
                  : []),
              ] as ReadonlyArray<{ value: LearningMode; label: string }>
            ).map((opt) => {
              const active = mode === opt.value;
              const disabled = opt.value === 'write' && !canUseWrite;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-disabled={disabled || undefined}
                  disabled={disabled}
                  title={disabled ? '사진이 등록된 학생이 있어야 사용할 수 있어요' : undefined}
                  onClick={() => {
                    if (disabled) return;
                    setMode(opt.value);
                    // ⚠️ resetSession() 이 아니라 새 모드를 직접 넘긴다 —
                    //    setMode 는 비동기라 resetSession 은 아직 이전 모드를 보고 초기화한다.
                    startSession(opt.value);
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    active
                      ? 'bg-sp-accent text-white'
                      : disabled
                        ? 'bg-sp-card text-sp-muted ring-1 ring-sp-border opacity-50 cursor-not-allowed'
                        : 'bg-sp-card text-sp-text hover:bg-sp-surface ring-1 ring-sp-border'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {FEATURE_FLAGS.studentPhotos && !canUseWrite && (
              <span className="text-xs text-sp-muted ml-1 break-keep">
                ('이름 쓰기'는 학생 사진이 있어야 써요)
              </span>
            )}
          </div>

          {/* 진행률 (aria-live 로 스크린리더에도 안내) */}
          <div aria-live="polite" aria-atomic="true" className="text-sm text-sp-muted ml-auto">
            {mode === 'quiz' ? (
              <span>
                {answeredCount}/{total}명 풀이 · 정답 {correctCount}
              </span>
            ) : mode === 'write' ? (
              <span>
                {writeAnswers.size}/{writePool.length}명 풀이 · 정답 {writeCorrectCount}
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
            className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base">close</span>
            <span>종료</span>
          </button>
        </header>

        {/* 본문 */}
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

          {/* 이름 쓰기 결과 요약 */}
          {mode === 'write' && writeFinished && (
            <section
              aria-live="polite"
              className="w-full max-w-5xl rounded-xl bg-sp-card ring-1 ring-sp-border px-5 py-4"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <span className="material-symbols-outlined text-sp-accent" aria-hidden="true">
                  check_circle
                </span>
                <h3 className="text-base font-bold text-sp-text">
                  {writePool.length}명 중 {writeCorrectCount}명 맞혔어요
                </h3>
                <span className="text-sm text-sp-muted">{elapsedAtFinish}초 걸렸습니다</span>
                <div className="ml-auto flex items-center gap-2">
                  {writeWrongSeats.length > 0 && (
                    <button
                      type="button"
                      onClick={retryWrongOnly}
                      className="px-3 py-1.5 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-300 ring-1 ring-red-500/30 text-sm font-medium"
                    >
                      틀린 학생만 다시 ({writeWrongSeats.length}명)
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetSession}
                    className="px-3 py-1.5 rounded-md bg-sp-accent text-white text-sm font-medium"
                  >
                    다시 하기
                  </button>
                </div>
              </div>
              {writeWrongNames.length > 0 && (
                <p className="mt-3 text-sm text-sp-text break-keep">
                  <span className="text-sp-muted">
                    아직 못 외운 학생 {writeWrongNames.length}명 ·{' '}
                  </span>
                  {writeWrongNames.join(', ')}
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
          ) : mode === 'write' ? (
            writeFinished ? null : writePool.length === 0 ? (
              <div className="text-center py-16 text-sp-muted">
                <span className="material-symbols-outlined text-3xl block mb-2 opacity-60">
                  photo_camera
                </span>
                <p>사진이 등록된 학생이 없어요.</p>
              </div>
            ) : (
              <div className="w-full max-w-sm flex flex-col items-center gap-4 py-4">
                <LearningCard
                  size="large"
                  focusable={false}
                  studentNumber={currentWriteStudent?.studentNumber}
                  studentName={currentWriteStudent?.name ?? '?'}
                  photoUrl={writeCurrentId ? photoUrls?.get(writeCurrentId) : undefined}
                  revealed={writePhase === 'graded'}
                  highlighted={writePhase === 'asking'}
                  answerState={writeAnswerState}
                  onClick={() => {}}
                />

                <input
                  ref={writeInputRef}
                  type="text"
                  value={writeInputValue}
                  onChange={(e) => setWriteInputValue(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    // ⚠️ 한글 조합 함정: "김"을 치는 동안에도 자모가 조합되고, 마지막 글자를
                    //    완성하는 Enter 가 "조합 종료용 Enter"로 먼저 브라우저에 전달된다.
                    //    이걸 그대로 제출로 받으면 아직 다 쓰지 못한 값이 제출된다.
                    //    isComposingRef 는 compositionstart/compositionend 로 우리가 직접 추적한
                    //    값이고, e.nativeEvent.isComposing 은 브라우저가 보고하는 값이다.
                    //    일부 IME·브라우저 조합에서는 compositionend 가 keydown 보다 늦게 와서
                    //    isComposingRef 가 아직 안 풀려 있을 수 있어 두 값을 함께 확인한다.
                    //    (실기기에서만 재현되는 종류의 버그라 여기 남겨 둔다.)
                    if (isComposingRef.current || e.nativeEvent.isComposing) return;
                    if (writePhase === 'asking') submitWriteAnswer(false);
                  }}
                  disabled={writePhase !== 'asking'}
                  placeholder="이름을 입력하고 Enter"
                  aria-label="이름 입력"
                  autoComplete="off"
                  className="w-full max-w-xs px-4 py-2.5 rounded-lg bg-sp-card text-sp-text ring-1 ring-sp-border focus:outline-none focus:ring-2 focus:ring-sp-accent text-center text-lg disabled:opacity-60"
                />

                <div className="flex items-center gap-2 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={() => setWriteHintShown(true)}
                    disabled={writePhase !== 'asking' || writeHintShown}
                    className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border disabled:opacity-50"
                  >
                    초성 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => submitWriteAnswer(true)}
                    disabled={writePhase !== 'asking'}
                    className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border disabled:opacity-50"
                  >
                    모르겠어요
                  </button>
                </div>

                {writeHintShown && writePhase === 'asking' && currentWriteStudent && (
                  <p className="text-sm text-sp-muted">
                    힌트:{' '}
                    <span className="font-mono text-sp-accent">
                      {toChosungHint(currentWriteStudent.name)}
                    </span>
                  </p>
                )}

                {writePhase === 'graded' && currentWriteStudent && (
                  <div className="w-full flex flex-col items-center gap-2">
                    <p
                      aria-live="polite"
                      className={`text-base font-bold ${
                        currentWriteVerdict ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {currentWriteVerdict
                        ? '정답이에요!'
                        : `정답: ${
                            currentWriteStudent.studentNumber !== undefined
                              ? `${currentWriteStudent.studentNumber}번 `
                              : ''
                          }${currentWriteStudent.name}`}
                    </p>
                    <button
                      ref={writeNextButtonRef}
                      type="button"
                      onClick={advanceWriteQuestion}
                      className="px-4 py-2 rounded-md bg-sp-accent text-white text-sm font-medium"
                    >
                      다음 →
                    </button>
                  </div>
                )}
              </div>
            )
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
                        className="min-h-[88px] rounded-xl border-2 border-dashed border-sp-border bg-sp-surface"
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
                      photoUrl={photoUrls?.get(studentId)}
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
        <footer className="shrink-0 border-t border-sp-border bg-sp-surface px-6 py-3 flex items-center gap-2 flex-wrap">
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
            {mode !== 'write' && (
              <>
                <button
                  type="button"
                  onClick={revealAll}
                  className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border"
                >
                  전체 공개
                </button>
                <button
                  type="button"
                  onClick={hideAll}
                  className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border"
                >
                  전체 숨김
                </button>
              </>
            )}
            <button
              type="button"
              onClick={resetSession}
              className="px-3 py-1.5 rounded-md bg-sp-card hover:bg-sp-surface text-sm text-sp-text ring-1 ring-sp-border"
            >
              리셋
            </button>
          </div>
        </footer>
      </div>
    </FocusTrap>
  );
}

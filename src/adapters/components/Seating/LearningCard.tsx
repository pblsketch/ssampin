import { forwardRef } from 'react';

interface LearningCardProps {
  /** 학생 학번 (앞면에 항상 표시) */
  studentNumber: number | undefined;
  /** 학생 이름 (뒷면) */
  studentName: string;
  /** 카드가 공개되었는지 (true=이름 보임) */
  revealed: boolean;
  /** 퀴즈 모드에서 현재 문제인지 (강조 외곽선) */
  highlighted: boolean;
  /** 정답/오답 상태 (퀴즈 모드 결과 표시) */
  answerState?: 'correct' | 'wrong';
  /** 행/열 — ARIA 라벨용 */
  row: number;
  col: number;
  onClick: () => void;
}

/**
 * 이름 학습 모드의 플립 카드.
 *
 * - 앞면(가림): 학번 + "?"
 * - 뒷면(공개): 학번 + 학생 이름
 * - 클릭 또는 Enter/Space 로 플립
 * - 외곽선: highlighted=노란 ring (현재 문제), correct=초록, wrong=빨강
 * - prefers-reduced-motion: 회전 전환 비활성
 */
export const LearningCard = forwardRef<HTMLButtonElement, LearningCardProps>(function LearningCard(
  { studentNumber, studentName, revealed, highlighted, answerState, row, col, onClick },
  ref,
) {
  const stateRing =
    answerState === 'correct'
      ? 'ring-2 ring-green-400'
      : answerState === 'wrong'
        ? 'ring-2 ring-red-400'
        : highlighted
          ? 'ring-2 ring-sp-warning shadow-[0_0_18px_rgba(245,158,11,0.45)]'
          : 'ring-1 ring-sp-border';

  const labelBase = `${row + 1}행 ${col + 1}열, ${
    studentNumber !== undefined ? `${studentNumber}번` : ''
  } ${revealed ? studentName : '가려진 카드'}`;

  return (
    <button
      ref={ref}
      type="button"
      role="button"
      aria-pressed={revealed}
      aria-label={labelBase}
      onClick={onClick}
      className={[
        'relative w-full min-h-[88px] rounded-xl px-2 py-3 flex flex-col items-center justify-center gap-1.5',
        'bg-sp-card text-sp-text transition-all duration-sp-base ease-sp-out',
        'hover:bg-sp-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
        stateRing,
      ].join(' ')}
    >
      <span className="text-xs font-mono text-sp-accent font-bold">
        {studentNumber !== undefined ? String(studentNumber).padStart(2, '0') : '--'}
      </span>
      {revealed ? (
        <span className="text-base font-semibold text-sp-text leading-tight text-center break-keep">
          {studentName}
        </span>
      ) : (
        <span className="text-2xl font-bold text-sp-muted" aria-hidden="true">
          ?
        </span>
      )}
    </button>
  );
});

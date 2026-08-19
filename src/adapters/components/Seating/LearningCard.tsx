import { forwardRef } from 'react';

interface LearningCardProps {
  /** 학생 학번 (앞면에 항상 표시 — 단, 사진이 있고 아직 공개 전이면 가린다) */
  studentNumber: number | undefined;
  /** 학생 이름 (뒷면) */
  studentName: string;
  /**
   * 얼굴 사진 URL(objectURL 등). 있으면 카드 앞면이 사진 전용으로 바뀐다.
   *
   * ⚠️ 사진이 있으면 공개 전까지 학번도 함께 가린다. 학번을 보여 주면 얼굴을 안 보고도
   * 명렬표 순서로 맞힐 수 있어(교사는 순서를 금방 외운다) 얼굴 퀴즈의 목적이 무너진다.
   * 공개된 뒤(정답 확인 시점)에만 학번 + 이름을 함께 보여 준다.
   */
  photoUrl?: string;
  /** 카드가 공개되었는지 (true=이름 보임, 사진 있으면 학번도 함께 보임) */
  revealed: boolean;
  /** 퀴즈 모드에서 현재 문제인지 (강조 외곽선) */
  highlighted: boolean;
  /** 정답/오답 상태 (퀴즈 모드 결과 표시) */
  answerState?: 'correct' | 'wrong';
  /** 행/열 — 자리 그리드 안에서 ARIA 라벨용. 그리드 밖(예: 이름 쓰기 모드의 단독 카드)에서는 생략 가능 */
  row?: number;
  col?: number;
  /** 'grid'(기본, 자리 그리드용 소형) | 'large'(이름 쓰기 모드의 단독 큰 카드) */
  size?: 'grid' | 'large';
  /**
   * 탭 포커스 대상에 포함할지. 이름 쓰기 모드의 큰 카드는 클릭으로 조작하지 않고
   * 아래 입력칸이 주 조작 대상이라, 탭 순서에서 비켜 둔다(기본 true).
   */
  focusable?: boolean;
  onClick: () => void;
}

/**
 * 이름 학습 모드의 플립 카드.
 *
 * - 앞면(가림): 학번 + "?" (사진이 있으면 사진만, 학번도 가림)
 * - 뒷면(공개): 학번 + 학생 이름 (사진이 있으면 사진도 함께)
 * - 클릭 또는 Enter/Space 로 플립
 * - 외곽선: highlighted=노란 ring (현재 문제), correct=초록, wrong=빨강
 * - prefers-reduced-motion: 회전 전환 비활성
 */
export const LearningCard = forwardRef<HTMLButtonElement, LearningCardProps>(function LearningCard(
  {
    studentNumber,
    studentName,
    photoUrl,
    revealed,
    highlighted,
    answerState,
    row,
    col,
    size = 'grid',
    focusable = true,
    onClick,
  },
  ref,
) {
  const isLarge = size === 'large';
  // 사진이 있고 아직 공개 전이면 학번도 가린다 — 학번으로 맞히기 방지
  const numberHiddenByPhoto = Boolean(photoUrl) && !revealed;

  const stateRing =
    answerState === 'correct'
      ? 'ring-2 ring-green-400'
      : answerState === 'wrong'
        ? 'ring-2 ring-red-400'
        : highlighted
          ? 'ring-2 ring-sp-warning shadow-[0_0_18px_rgba(245,158,11,0.45)]'
          : 'ring-1 ring-sp-border';

  const positionLabel = row !== undefined && col !== undefined ? `${row + 1}행 ${col + 1}열, ` : '';
  const numberLabel =
    studentNumber !== undefined && !numberHiddenByPhoto ? `${studentNumber}번` : '';
  const labelBase = `${positionLabel}${numberLabel} ${revealed ? studentName : '가려진 카드'}`;

  const rootSizeClasses = isLarge
    ? 'min-h-[320px] px-4 py-6 gap-3'
    : 'min-h-[88px] px-2 py-3 gap-1.5';
  const numberSizeClasses = isLarge ? 'text-sm' : 'text-xs';
  const nameSizeClasses = isLarge ? 'text-xl' : 'text-base';
  const placeholderSizeClasses = isLarge ? 'text-5xl' : 'text-2xl';
  const photoWrapSizeClasses = isLarge ? 'w-48 sm:w-56 aspect-[3/4]' : 'w-14 sm:w-16 aspect-[3/4]';

  return (
    <button
      ref={ref}
      type="button"
      role="button"
      aria-pressed={revealed}
      aria-label={labelBase}
      tabIndex={focusable ? undefined : -1}
      onClick={onClick}
      className={[
        'relative w-full rounded-xl flex flex-col items-center justify-center',
        rootSizeClasses,
        'bg-sp-card text-sp-text transition-all duration-sp-base ease-sp-out',
        'hover:bg-sp-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
        stateRing,
      ].join(' ')}
    >
      {photoUrl ? (
        <div
          className={`overflow-hidden rounded-lg ring-1 ring-sp-border bg-sp-surface ${photoWrapSizeClasses}`}
        >
          <img src={photoUrl} alt="" draggable={false} className="w-full h-full object-cover" />
        </div>
      ) : (
        <span className={`font-mono text-sp-accent font-bold ${numberSizeClasses}`}>
          {studentNumber !== undefined ? String(studentNumber).padStart(2, '0') : '--'}
        </span>
      )}

      {/* 사진이 있을 때는 학번을 별도 줄로 공개 시점에만 보여 준다 */}
      {photoUrl && revealed && (
        <span className={`font-mono text-sp-accent font-bold ${numberSizeClasses}`}>
          {studentNumber !== undefined ? String(studentNumber).padStart(2, '0') : '--'}
        </span>
      )}

      {revealed ? (
        <span
          className={`font-semibold text-sp-text leading-tight text-center break-keep ${nameSizeClasses}`}
        >
          {studentName}
        </span>
      ) : (
        !photoUrl && (
          <span className={`font-bold text-sp-muted ${placeholderSizeClasses}`} aria-hidden="true">
            ?
          </span>
        )
      )}
    </button>
  );
});

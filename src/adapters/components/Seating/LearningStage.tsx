/**
 * 이름 학습 화면의 연출 조각들.
 *
 * `NameLearningMode`가 이미 1,000줄이 넘어서, 화면 조각을 더 밀어 넣는 대신 여기로 뺀다.
 * 연출 규칙은 전부 `learningMotion.ts`가 정하고 여기서는 붙이기만 한다.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from '@adapters/motion';
import { resolveLearningMotion, staggerDelayMs } from './learningMotion';
import { useLearningMotion } from './useLearningMotion';

/**
 * 문제 하나가 놓이는 자리 — 문제가 바뀌면 오른쪽에서 들어온다.
 *
 * 방향에 뜻이 있다. 오른쪽에서 들어오면 "다음으로 넘어갔다"로 읽히고, 제자리에서 바뀌면
 * 화면이 그냥 갈아 끼워진 것처럼 보여 몇 문제를 풀었는지 감각이 생기지 않는다.
 */
export function LearningStage({
  trigger,
  className,
  children,
}: {
  /** 문제가 바뀐 것을 알아볼 값(학생 id 등) */
  readonly trigger: string | number;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const reducedMotion = useReducedMotion();
  const motion = reducedMotion ? 'none' : 'enter';
  const ref = useLearningMotion<HTMLDivElement>(motion, trigger);

  return (
    <div ref={ref} data-learning-motion={motion} className={className}>
      {children}
    </div>
  );
}

/**
 * 숫자가 바뀔 때 짧게 굴러 올라간다.
 *
 * 정답 수가 조용히 바뀌면 늘어난 줄을 모르고 지나간다. 눈이 그 자리로 한 번 가도록
 * 아주 짧게(120ms) 움직인다 — 이보다 길면 문제 푸는 흐름을 방해한다.
 */
export function RollingCount({
  value,
  className,
}: {
  readonly value: number;
  readonly className?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [rolling, setRolling] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current === value) return;
    previous.current = value;
    if (reducedMotion) return;
    setRolling(true);
    const timer = window.setTimeout(() => setRolling(false), 120);
    return () => window.clearTimeout(timer);
  }, [value, reducedMotion]);

  return (
    <span
      data-rolling={rolling ? 'true' : 'false'}
      className={`inline-block tabular-nums transition-transform duration-sp-quick ease-sp-out ${
        rolling ? '-translate-y-1' : 'translate-y-0'
      } ${className ?? ''}`}
    >
      {value}
    </span>
  );
}

/**
 * 얼마나 풀었는지 보여주는 막대.
 *
 * 숫자만 있으면 "25명 중 12명"을 매번 머릿속으로 환산해야 한다. 막대가 차오르면
 * 남은 양이 눈으로 바로 잡힌다.
 */
export function LearningProgressBar({
  done,
  total,
}: {
  readonly done: number;
  readonly total: number;
}) {
  const ratio = total <= 0 ? 0 : Math.min(1, done / total);

  return (
    <div
      className="h-1.5 w-24 overflow-hidden rounded-full bg-sp-surface ring-1 ring-sp-border"
      role="presentation"
    >
      <div
        data-testid="learning-progress-fill"
        className="h-full rounded-full bg-sp-accent transition-[width] duration-sp-slow ease-sp-out"
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

/**
 * 못 외운 학생 이름이 차례로 나타난다.
 *
 * 한꺼번에 뜨면 몇 명인지 세어야 하지만, 차례로 나타나면 세지 않아도 양이 느껴진다.
 */
export function StaggeredNames({ names }: { readonly names: readonly string[] }) {
  const reducedMotion = useReducedMotion();

  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {names.map((name, index) => (
        <span
          key={`${name}-${index}`}
          data-learning-stagger={reducedMotion ? 'off' : 'on'}
          className={`rounded-md bg-sp-surface px-2 py-0.5 text-sm text-sp-text ring-1 ring-sp-border ${
            reducedMotion ? '' : 'animate-sp-name-in'
          }`}
          style={
            reducedMotion
              ? undefined
              : { animationDelay: `${staggerDelayMs(index, names.length)}ms` }
          }
        >
          {name}
        </span>
      ))}
    </span>
  );
}

/**
 * 매칭하기의 이름 한 줄.
 *
 * 고른 줄에는 얼굴 카드와 **같은 연출**을 준다 — 맞으면 커졌다 돌아오고, 틀리면 흔들린다.
 * 눈이 사진에 가 있든 명단에 가 있든 결과를 놓치지 않는다.
 * 짝이 지어진 줄은 줄어들며 흐려져, 남은 문제가 눈으로 줄어드는 것이 보인다.
 */
export function MatchOptionRow({
  label,
  studentNumber,
  matched,
  picked,
  verdict,
  disabled,
  onPick,
}: {
  readonly label: string;
  readonly studentNumber: number | undefined;
  readonly matched: boolean;
  readonly picked: boolean;
  readonly verdict: boolean | null;
  readonly disabled: boolean;
  readonly onPick: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const answerState = picked && verdict !== null ? (verdict ? 'correct' : 'wrong') : undefined;
  const motion = resolveLearningMotion({ answerState, revealed: false, reducedMotion });
  const ref = useLearningMotion<HTMLButtonElement>(motion, label);

  const pickedTone = picked
    ? verdict
      ? 'bg-green-500/20 text-green-300 ring-green-500/40'
      : 'bg-red-500/20 text-red-300 ring-red-500/40'
    : '';

  return (
    <button
      ref={ref}
      type="button"
      data-learning-motion={motion}
      disabled={disabled}
      onClick={onPick}
      className={`px-2.5 py-2 rounded-lg text-sm text-left truncate ring-1 transition-all duration-sp-slow ease-sp-out ${
        pickedTone ||
        (matched
          ? 'bg-sp-surface text-sp-muted ring-sp-border opacity-40 scale-95 line-through cursor-not-allowed'
          : 'bg-sp-surface text-sp-text ring-sp-border hover:bg-sp-card disabled:opacity-60')
      }`}
    >
      {studentNumber !== undefined && (
        <span className="font-mono text-xs text-sp-muted mr-1.5">
          {String(studentNumber).padStart(2, '0')}
        </span>
      )}
      {label}
    </button>
  );
}

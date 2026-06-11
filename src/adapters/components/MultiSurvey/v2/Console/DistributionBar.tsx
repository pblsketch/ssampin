/**
 * DistributionBar — 가로 막대 응답 분포 (단일 보기).
 *
 * - width 0 → percentage% 트랜지션 (sp-duration-slow × 3 = 600ms).
 * - 정답=sp-accent, 오답=sp-muted.
 * - prefers-reduced-motion 시 즉시 표시.
 *
 * sp-* 토큰: sp-accent / sp-muted / sp-duration-slow
 */

import { memo, useEffect, useRef, useState } from 'react';

interface DistributionBarProps {
  readonly label: string;
  readonly text?: string;
  readonly count: number;
  /** 0 ~ 100 정수 */
  readonly percentage: number;
  readonly isCorrect: boolean;
}

function DistributionBarImpl({
  label,
  text,
  count,
  percentage,
  isCorrect,
}: DistributionBarProps): JSX.Element {
  const [renderWidth, setRenderWidth] = useState(0);
  const reducedRef = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    reducedRef.current = mq.matches;
    if (mq.matches) {
      setRenderWidth(percentage);
      return;
    }
    const raf = requestAnimationFrame(() => setRenderWidth(percentage));
    return () => cancelAnimationFrame(raf);
  }, [percentage]);

  const fillClass = isCorrect ? 'bg-sp-accent' : 'bg-sp-muted';
  // Phase B B.7 S2-B: 600ms 하드코딩 → 토큰 calc. sp-duration-slow(200ms) × 3 = 600ms 의도 유지.
  const transitionStyle: React.CSSProperties = reducedRef.current
    ? {}
    : { transition: 'width calc(var(--sp-duration-slow) * 3) var(--sp-ease-out)' };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label={`${label} 응답 분포`}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <span
            className={isCorrect ? 'font-sp-bold text-sp-accent' : 'font-sp-bold text-sp-text'}
            style={{ fontSize: 24 }}
          >
            {label}
          </span>
          {text !== undefined && text.length > 0 && (
            <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
              {text}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2 font-sp-semibold text-sp-text">
          <span style={{ fontSize: 22 }}>{count}</span>
          <span style={{ fontSize: 14 }}>명</span>
          <span className="ml-2 text-sp-muted" style={{ fontSize: 18 }}>
            {percentage}%
          </span>
        </div>
      </div>
      <div
        className="relative h-6 w-full overflow-hidden rounded-full bg-sp-muted/15"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className={`h-full rounded-full ${fillClass}`}
          style={{ width: `${renderWidth}%`, ...transitionStyle }}
        />
      </div>
    </div>
  );
}

export const DistributionBar = memo(DistributionBarImpl);

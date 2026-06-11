/**
 * ShareDistributionBar — 응답 분포 가로 막대 (단일 선택지/보기).
 *
 * - width 0 → 비율% 애니메이션 (0.6s ease-out)
 * - 정답인 경우 sp-accent, 오답은 sp-muted
 * - duration은 sp-duration-slow(200ms) 의 3배인 600ms (component-tree §4 명시)
 *   prefers-reduced-motion 시 즉시 표시.
 */

import { memo, useEffect, useRef, useState } from 'react';

interface ShareDistributionBarProps {
  /** 보기 라벨 (예: "①", "O", "정답 후보 1") */
  readonly label: string;
  /** 보기 본문 텍스트 */
  readonly text?: string;
  /** 응답 수 */
  readonly count: number;
  /** 응답 비율 0~100 */
  readonly percentage: number;
  /** 정답 여부 */
  readonly isCorrect: boolean;
}

function ShareDistributionBarImpl({
  label,
  text,
  count,
  percentage,
  isCorrect,
}: ShareDistributionBarProps): JSX.Element {
  const [renderWidth, setRenderWidth] = useState(0);
  const prefersReducedMotionRef = useRef<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    prefersReducedMotionRef.current = mq.matches;
    if (mq.matches) {
      setRenderWidth(percentage);
      return;
    }
    // 다음 paint 이후에 폭 부여 → 0 → 비율% 트랜지션 발생
    const raf = requestAnimationFrame(() => {
      setRenderWidth(percentage);
    });
    return () => cancelAnimationFrame(raf);
  }, [percentage]);

  const trackBg = 'bg-sp-muted/15';
  const fillBg = isCorrect ? 'bg-sp-accent' : 'bg-sp-muted';
  const transitionStyle = prefersReducedMotionRef.current
    ? undefined
    : {
        transition: 'width 600ms var(--sp-ease-out)',
        // sp-duration-slow(200ms)의 3배. var(--sp-duration-slow) 토큰은 transition-duration 전용이라
        // 600ms를 inline calc로 합성. 토큰 사용 의도를 ease-out 변수로 표명.
      };

  return (
    <div className="flex flex-col gap-3" role="group" aria-label={`${label} 응답 분포`}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-4">
          <span
            className={`font-sp-bold ${isCorrect ? 'text-sp-accent' : 'text-sp-text'}`}
            style={{ fontSize: 40 }}
          >
            {label}
          </span>
          {text !== undefined && text.length > 0 ? (
            <span className="font-sp-medium text-sp-text" style={{ fontSize: 28 }}>
              {text}
            </span>
          ) : null}
        </div>
        <div className="flex items-baseline gap-3 font-sp-semibold text-sp-text">
          <span style={{ fontSize: 36 }}>{count}</span>
          <span style={{ fontSize: 22 }}>명</span>
          <span className="ml-3 text-sp-muted" style={{ fontSize: 28 }}>
            {percentage}%
          </span>
        </div>
      </div>
      <div
        className={`relative h-10 w-full overflow-hidden rounded-sp-pill ${trackBg}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
      >
        <div
          className={`h-full rounded-sp-pill ${fillBg}`}
          style={{ width: `${renderWidth}%`, ...transitionStyle }}
        />
      </div>
    </div>
  );
}

export const ShareDistributionBar = memo(ShareDistributionBarImpl);

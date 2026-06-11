/**
 * TimerBar — 문항 타이머 progress bar.
 *
 * - 남은 시간 비율로 width 표시 (1.0 → 0.0)
 * - 5초 이하 pulse 애니메이션 + 색 sp-highlight 강조
 * - aria-live="polite", aria-valuenow 갱신
 *
 * sp-* 토큰: sp-accent / sp-highlight / sp-duration-base
 *
 * remainingSeconds 갱신은 부모(useEffect/Interval)가 담당. 본 컴포넌트는 표시 전용.
 */

import { memo } from 'react';

interface TimerBarProps {
  readonly totalSeconds: number;
  readonly remainingSeconds: number;
}

function TimerBarImpl({ totalSeconds, remainingSeconds }: TimerBarProps): JSX.Element {
  const clamped = Math.max(0, Math.min(totalSeconds, remainingSeconds));
  const ratio = totalSeconds > 0 ? clamped / totalSeconds : 0;
  const widthPct = Math.round(ratio * 100);
  const urgent = clamped <= 5;
  const fillClass = urgent ? 'bg-sp-highlight' : 'bg-sp-accent';
  // Phase B B.7 S2-A: index.css에 정의된 sp-timer-urgent keyframe 사용.
  //   prefers-reduced-motion 시 keyframe 자체가 no-op으로 override됨 (index.css 참조).
  const pulseStyle: React.CSSProperties = urgent
    ? { animation: 'sp-timer-urgent 1s ease-in-out infinite' }
    : {};

  return (
    <div
      className="flex w-full flex-col gap-2"
      role="timer"
      aria-live="polite"
      aria-label="남은 시간"
    >
      <div className="flex items-baseline justify-between">
        <span className="font-sp-medium text-sp-text" style={{ fontSize: 16 }}>
          남은 시간
        </span>
        <span
          className={urgent ? 'font-sp-bold text-sp-highlight' : 'font-sp-bold text-sp-accent'}
          style={{ fontSize: 24 }}
        >
          {clamped}초
        </span>
      </div>
      <div
        className="relative h-3 w-full overflow-hidden rounded-full bg-sp-border"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={totalSeconds}
        aria-valuenow={clamped}
      >
        <div
          className={`h-full ${fillClass}`}
          style={{
            width: `${widthPct}%`,
            transition: 'width var(--sp-duration-base) var(--sp-ease-out)',
            ...pulseStyle,
          }}
        />
      </div>
    </div>
  );
}

export const TimerBar = memo(TimerBarImpl);

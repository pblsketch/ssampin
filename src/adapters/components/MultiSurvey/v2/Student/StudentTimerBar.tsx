/**
 * StudentTimerBar — 모바일용 progress bar.
 *
 * - remainingSec / totalSec 비율로 폭 결정.
 * - 5초 이하 pulse (prefers-reduced-motion 시 색상만 변경).
 * - role="progressbar" + aria-valuenow/min/max.
 */

import { memo, useEffect, useState } from 'react';

interface StudentTimerBarProps {
  readonly remainingSec: number;
  readonly totalSec: number;
}

function StudentTimerBarImpl({ remainingSec, totalSec }: StudentTimerBarProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  const safeTotal = totalSec > 0 ? totalSec : 1;
  const ratio = Math.max(0, Math.min(1, remainingSec / safeTotal));
  const percent = Math.round(ratio * 100);
  const isUrgent = remainingSec <= 5 && remainingSec > 0;

  const fillColor = isUrgent ? 'var(--color-highlight, #fbbf24)' : 'var(--color-accent, #60a5fa)';

  return (
    <div
      className="flex flex-col gap-1"
      role="progressbar"
      aria-valuenow={Math.max(0, Math.ceil(remainingSec))}
      aria-valuemin={0}
      aria-valuemax={totalSec}
      aria-label={`남은 시간 ${Math.max(0, Math.ceil(remainingSec))}초`}
    >
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-sp-border"
        style={{ backgroundColor: 'var(--color-border, #334155)' }}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${
            isUrgent && !reduceMotion ? 'sp-timer-pulse' : ''
          }`}
          style={{
            width: `${percent}%`,
            backgroundColor: fillColor,
          }}
        />
      </div>
      <span
        className="self-end font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
      >
        {Math.max(0, Math.ceil(remainingSec))}초
      </span>
      <style>{`
        @keyframes sp-timer-pulse-kf {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.5; }
        }
        .sp-timer-pulse {
          animation: sp-timer-pulse-kf 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export const StudentTimerBar = memo(StudentTimerBarImpl);

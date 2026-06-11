/**
 * WaitingOverlay — 제출 완료 후 다른 학생 대기 화면.
 *
 * - 응답 카운터 (현재 응답 / 전체 학생 수).
 * - 부드러운 펄스 효과 (prefers-reduced-motion 존중).
 */

import { memo, useEffect, useState } from 'react';

interface WaitingOverlayProps {
  readonly answeredCount: number;
  readonly totalCount: number;
  readonly message?: string;
}

function WaitingOverlayImpl({
  answeredCount,
  totalCount,
  message,
}: WaitingOverlayProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-6 rounded-3xl bg-sp-card px-6 py-10"
      style={{ backgroundColor: 'var(--color-card, #1a1f2e)' }}
    >
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-full ${
          reduceMotion ? '' : 'sp-waiting-pulse'
        }`}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent, #60a5fa) 20%, transparent)',
        }}
        aria-hidden="true"
      >
        <span style={{ fontSize: 40 }}>✅</span>
      </div>

      <p
        className="font-sp-bold text-sp-text"
        style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 20 }}
      >
        {message ?? '제출 완료!'}
      </p>

      <p
        className="font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
      >
        다른 친구들을 기다리는 중...
      </p>

      <div
        className="flex items-baseline gap-2 font-sp-semibold"
        style={{ color: 'var(--color-accent, #60a5fa)' }}
      >
        <span style={{ fontSize: 36 }}>{answeredCount}</span>
        <span style={{ fontSize: 18, color: 'var(--color-muted, #94a3b8)' }}>/ {totalCount}명</span>
      </div>

      <style>{`
        @keyframes sp-waiting-pulse-kf {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.08); opacity: 0.8; }
        }
        .sp-waiting-pulse {
          animation: sp-waiting-pulse-kf 1.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export const WaitingOverlay = memo(WaitingOverlayImpl);

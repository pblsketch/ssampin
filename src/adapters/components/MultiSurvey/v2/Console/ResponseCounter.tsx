/**
 * ResponseCounter — 실시간 응답 카운트 (N/M명).
 *
 * - 숫자 변경 시 짧은 롤링 애니메이션 (translateY) — sp-duration-base.
 * - aria-live="polite", 학생 응답 추가 시 스크린리더 안내.
 * - prefers-reduced-motion 시 즉시 표시.
 *
 * sp-* 토큰: sp-text / sp-muted / sp-accent
 */

import { memo, useEffect, useRef, useState } from 'react';

interface ResponseCounterProps {
  readonly responseCount: number;
  readonly expectedCount: number;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function RollingNumber({
  value,
  className,
  fontSize,
}: {
  readonly value: number;
  readonly className: string;
  readonly fontSize: number;
}): JSX.Element {
  const reduced = usePrefersReducedMotion();
  const [displayed, setDisplayed] = useState(value);
  const [rolling, setRolling] = useState(false);
  const prevRef = useRef(value);

  useEffect(() => {
    if (prevRef.current === value) return;
    if (reduced) {
      setDisplayed(value);
      prevRef.current = value;
      return;
    }
    setRolling(true);
    const t = window.setTimeout(() => {
      setDisplayed(value);
      setRolling(false);
      prevRef.current = value;
    }, 80);
    return () => window.clearTimeout(t);
  }, [value, reduced]);

  const style: React.CSSProperties = reduced
    ? { fontSize }
    : {
        fontSize,
        transition:
          'transform var(--sp-duration-base) var(--sp-ease-out), opacity var(--sp-duration-base) var(--sp-ease-out)',
        transform: rolling ? 'translateY(-6px)' : 'translateY(0)',
        opacity: rolling ? 0.4 : 1,
        display: 'inline-block',
      };

  return (
    <span className={className} style={style}>
      {displayed}
    </span>
  );
}

function ResponseCounterImpl({ responseCount, expectedCount }: ResponseCounterProps): JSX.Element {
  const allArrived = expectedCount > 0 && responseCount >= expectedCount;
  return (
    <div
      className="flex w-full items-baseline justify-between rounded-xl border border-sp-border bg-sp-card px-6 py-4"
      role="status"
      aria-live="polite"
      aria-label="응답 현황"
    >
      <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
        응답 현황
      </span>
      <div className="flex items-baseline gap-2">
        <RollingNumber
          value={responseCount}
          className={allArrived ? 'font-sp-bold text-sp-accent' : 'font-sp-bold text-sp-text'}
          fontSize={32}
        />
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 20 }}>
          / {expectedCount}명
        </span>
      </div>
    </div>
  );
}

export const ResponseCounter = memo(ResponseCounterImpl);

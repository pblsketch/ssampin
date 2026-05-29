import { useEffect, useRef, type ReactNode } from 'react';

/**
 * PiiPinUnlockOverlay — PII overlay 영역 5분 독립 idle re-lock
 *
 * 글로벌 `classManagement` PIN 세션이 살아있어도, PII 노출 영역은
 * 자체 idle 타이머로 다시 잠근다. (ADR Addendum 1 + Decision 9)
 *
 * **사용 패턴**:
 *   ```tsx
 *   <PiiPinUnlockOverlay
 *     idleMs={5 * 60 * 1000}
 *     onTimeout={() => setLocked(true)}
 *   >
 *     <RosterPiiSection />
 *   </PiiPinUnlockOverlay>
 *   ```
 *
 * - mouse/keyboard/scroll 활동 감지 시 타이머 리셋.
 * - 타이머 만료 시 `onTimeout` 호출 (실제 잠금 처리는 부모가 담당).
 *
 * 관련 ADR: docs/architecture/student-pii-adr-v1.2.md Decision 9, Architect §R11 / N-4
 */
export interface PiiPinUnlockOverlayProps {
  /** idle 임계 (ms). 기본 5분. */
  readonly idleMs?: number;
  /** 타이머 만료 시 호출 (잠금 처리는 부모 책임). */
  readonly onTimeout: () => void;
  /** 추적 이벤트 (기본: mousemove/keydown/scroll/click). */
  readonly events?: readonly (keyof WindowEventMap)[];
  readonly children: ReactNode;
}

const DEFAULT_IDLE_MS = 5 * 60 * 1000;
const DEFAULT_EVENTS: readonly (keyof WindowEventMap)[] = [
  'mousemove',
  'keydown',
  'scroll',
  'click',
];

export function PiiPinUnlockOverlay(props: PiiPinUnlockOverlayProps): React.ReactElement {
  const { idleMs = DEFAULT_IDLE_MS, onTimeout, events = DEFAULT_EVENTS, children } = props;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // events 배열을 stable 키로 변환 (props 배열이 매 렌더 동일 식별성을 보장하지 않을 수 있음)
  const eventsKey = events.join(',');

  useEffect(() => {
    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(onTimeout, idleMs);
    };

    reset();

    const evList = eventsKey.split(',') as Array<keyof WindowEventMap>;
    for (const evt of evList) {
      window.addEventListener(evt, reset, { passive: true });
    }
    return () => {
      for (const evt of evList) {
        window.removeEventListener(evt, reset);
      }
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [idleMs, onTimeout, eventsKey]);

  return <>{children}</>;
}

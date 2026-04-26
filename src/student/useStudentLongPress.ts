import { useCallback, useEffect, useRef } from 'react';

/**
 * v2.1 신규 (Phase A-A2 / Plan FR-A2 / Design v2.1 §5.1).
 *
 * 모바일 빈 영역 600ms long-press(touchhold) 진입 훅.
 *
 * 정책:
 * - **`C` 단축키 절대 사용 X (회귀 위험 #6)** — 본 훅이 모바일 진입의 유일한 대체
 * - 카드/버튼/링크/이미지/textarea 위 long-press는 무동작 (이벤트 전파 차단)
 *   → `data-empty-area="true"` 속성이 붙은 요소 위에서만 동작
 * - IME composition 중에도 무동작 (그냥 textarea 위 hit area는 무관 — 본 훅은 보드 빈 영역에서만 활성)
 * - touchmove > MOVE_THRESHOLD_PX 시 cancel (스크롤 의도)
 * - touchend / touchcancel 시 timer cleanup
 *
 * Plan FR-A2 / Design v2.1 §5.1 / §13 Phase A 수용 기준 #3.
 */

const LONG_PRESS_MS = 600;
const MOVE_THRESHOLD_PX = 10;

export interface UseStudentLongPressOptions {
  /** long-press 발생 시 호출되는 콜백 (모달 열기 등) */
  readonly onLongPress: () => void;
  /** 활성 여부 — false면 hook이 noop (예: 모달이 이미 열려있을 때) */
  readonly enabled?: boolean;
  /** custom delay (ms). default 600 */
  readonly delayMs?: number;
}

export interface UseStudentLongPressHandlers {
  readonly onTouchStart: (event: React.TouchEvent | TouchEvent) => void;
  readonly onTouchMove: (event: React.TouchEvent | TouchEvent) => void;
  readonly onTouchEnd: () => void;
  readonly onTouchCancel: () => void;
}

/**
 * 빈 영역인지 판정 — `data-empty-area="true"` 속성이 붙은 요소만 허용.
 * 카드/버튼/입력 등 인터랙티브 요소는 그 영역에서 발생한 이벤트로 간주해 cancel.
 */
function isEmptyAreaTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const closest = target.closest('[data-empty-area="true"]');
  if (!closest) return false;
  // 추가 안전: 카드/버튼 등 인터랙티브 자식 요소 위에서 발생한 이벤트는 거부
  const interactive = target.closest('button, a, input, textarea, select, [role="button"], [data-card-root="true"]');
  if (interactive && closest.contains(interactive)) {
    // interactive가 closest의 자식이라면 그 위에서 발생한 이벤트 → 거부
    return false;
  }
  return true;
}

export function useStudentLongPress(options: UseStudentLongPressOptions): UseStudentLongPressHandlers {
  const { onLongPress, enabled = true, delayMs = LONG_PRESS_MS } = options;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const onLongPressRef = useRef(onLongPress);

  // onLongPress가 매 렌더 새 함수일 수 있으므로 ref로 안정화
  useEffect(() => {
    onLongPressRef.current = onLongPress;
  }, [onLongPress]);

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  }, []);

  const onTouchStart = useCallback(
    (event: React.TouchEvent | TouchEvent) => {
      if (!enabled) return;
      const target = (event as TouchEvent).target ?? null;
      if (!isEmptyAreaTarget(target)) return;
      const touch = event.touches[0];
      if (!touch) return;
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      cancel(); // ensure no stale timer
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        startPosRef.current = null;
        try {
          onLongPressRef.current();
        } catch {
          // noop — UI 콜백 실패는 무시
        }
      }, delayMs);
    },
    [enabled, delayMs, cancel],
  );

  const onTouchMove = useCallback(
    (event: React.TouchEvent | TouchEvent) => {
      if (!startPosRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - startPosRef.current.x;
      const dy = touch.clientY - startPosRef.current.y;
      if (Math.abs(dx) > MOVE_THRESHOLD_PX || Math.abs(dy) > MOVE_THRESHOLD_PX) {
        cancel();
      }
    },
    [cancel],
  );

  // unmount 시 타이머 정리
  useEffect(() => () => cancel(), [cancel]);

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd: cancel,
    onTouchCancel: cancel,
  };
}

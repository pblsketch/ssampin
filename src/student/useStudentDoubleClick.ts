import { useCallback, useEffect, useRef } from 'react';

/**
 * v2.1 신규 (Phase A-A2 / Plan FR-A2 / Design v2.1 §5.1).
 *
 * 데스크톱 빈 영역 더블클릭 진입 훅.
 *
 * 정책:
 * - **`C` 단축키 절대 사용 X (회귀 위험 #6)** — 본 훅이 데스크톱 진입의 유일한 대체
 * - 카드/버튼/링크/이미지/textarea 위 더블클릭은 무동작 (인터랙티브 자식 요소 차단)
 *   → `data-empty-area="true"` 속성이 붙은 요소 위에서만 동작
 * - 텍스트 선택 동작 보존 — 본 훅은 빈 영역 한정이므로 텍스트 더블클릭 단어 선택과 무관
 * - touch 환경에서는 `onTouchStart` 발생 직후 30ms 내 click이 합성 click으로 들어와
 *   더블클릭으로 잘못 트리거되는 경우가 있으므로, touchInProgressRef로 차단
 *
 * Plan FR-A2 / Design v2.1 §5.1 / §13 Phase A 수용 기준 #4.
 */

const TOUCH_SUPPRESS_MS = 700; // long-press 발생 가능 윈도우와 일치

export interface UseStudentDoubleClickOptions {
  /** 더블클릭 발생 시 호출되는 콜백 (모달 열기 등) */
  readonly onDoubleClick: () => void;
  /** 활성 여부 — false면 hook이 noop */
  readonly enabled?: boolean;
}

export interface UseStudentDoubleClickHandlers {
  readonly onDoubleClick: (event: React.MouseEvent) => void;
  readonly onTouchStart: () => void;
}

/**
 * 빈 영역인지 판정 — `data-empty-area="true"` 영역이 가장 가까운 조상이고,
 * 그 사이에 인터랙티브 요소가 없을 때만 true.
 */
function isEmptyAreaTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) return false;
  const closest = target.closest('[data-empty-area="true"]');
  if (!closest) return false;
  const interactive = target.closest('button, a, input, textarea, select, [role="button"], [data-card-root="true"]');
  if (interactive && closest.contains(interactive)) {
    return false;
  }
  return true;
}

export function useStudentDoubleClick(options: UseStudentDoubleClickOptions): UseStudentDoubleClickHandlers {
  const { onDoubleClick, enabled = true } = options;

  const onDoubleClickRef = useRef(onDoubleClick);
  const touchInProgressRef = useRef<number>(0);

  useEffect(() => {
    onDoubleClickRef.current = onDoubleClick;
  }, [onDoubleClick]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      if (!enabled) return;
      // 합성 마우스 이벤트(touch -> mouse) 차단 — 모바일 long-press 발생 시
      const sinceTouch = Date.now() - touchInProgressRef.current;
      if (sinceTouch < TOUCH_SUPPRESS_MS) return;
      if (!isEmptyAreaTarget(event.target)) return;
      try {
        onDoubleClickRef.current();
      } catch {
        // noop — UI 콜백 실패는 무시
      }
    },
    [enabled],
  );

  const handleTouchStart = useCallback(() => {
    touchInProgressRef.current = Date.now();
  }, []);

  return {
    onDoubleClick: handleDoubleClick,
    onTouchStart: handleTouchStart,
  };
}

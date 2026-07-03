import { useRef, useState, useEffect, useCallback } from 'react';
import { haptic } from '@mobile/utils/haptic';
import { useSwipeRowStore } from '@mobile/stores/useMobileSwipeRowStore';

const THRESHOLD = 56; // px — 이 이상 끌면 액션 노출 고정
const SCROLL_GUARD = 8; // 수직 이동이 이만큼 넘으면 스크롤로 간주해 스와이프 취소

interface SwipeRowProps {
  rowId: string;
  /** 오른쪽 스와이프 → 왼쪽에 노출되는 액션 영역. 없으면 오른쪽 스와이프 비활성. */
  leftActions?: React.ReactNode;
  /** 왼쪽 스와이프 → 오른쪽에 노출되는 액션 영역. 없으면 왼쪽 스와이프 비활성. */
  rightActions?: React.ReactNode;
  leftRevealWidth?: number;
  rightRevealWidth?: number;
  disabled?: boolean;
  children: React.ReactNode;
}

/**
 * 좌/우 스와이프-투-리빌 행 래퍼 (무라이브러리, 포인터 이벤트).
 * - 스와이프 자체로는 아무것도 실행 안 함 — 드러난 액션 버튼을 한 번 더 탭해야 실행한다.
 * - 임계(56px) 미달이면 원위치 스냅, 이상이면 노출 고정. 다른 행을 건드리면 자동으로 닫힌다.
 * - 수직 스크롤이 수평보다 크면 스와이프를 취소(스크롤 우선).
 * - 스와이프 못 하는 사용자는 children(행 본문)을 그냥 탭하면 기존 경로(바텀시트)가 그대로 동작 → a11y 대체.
 */
export function SwipeRow({
  rowId,
  leftActions,
  rightActions,
  leftRevealWidth = 80,
  rightRevealWidth = 152,
  disabled = false,
  children,
}: SwipeRowProps) {
  const openRowId = useSwipeRowStore((s) => s.openRowId);
  const setOpenRow = useSwipeRowStore((s) => s.setOpenRow);

  const [offset, setOffsetState] = useState(0); // 현재 X 변위 (음수=왼쪽으로 밀림)
  const [dragging, setDragging] = useState(false);

  const startX = useRef(0);
  const startY = useRef(0);
  const axis = useRef<'none' | 'h' | 'v'>('none');
  const hapticFired = useRef(false);
  const settledRef = useRef(0); // 드래그 시작 시점의 고정 offset
  const offsetRef = useRef(0); // 최신 offset (리렌더 타이밍과 무관하게 onPointerUp 에서 참조)

  const setOffset = useCallback((v: number) => {
    offsetRef.current = v;
    setOffsetState(v);
  }, []);

  // 다른 행이 열리면(또는 전부 닫히면) 이 행도 닫는다
  useEffect(() => {
    if (openRowId !== rowId && !dragging && offsetRef.current !== 0) {
      setOffset(0);
    }
  }, [openRowId, rowId, dragging, setOffset]);

  const close = useCallback(() => {
    setOffset(0);
    if (openRowId === rowId) setOpenRow(null);
  }, [openRowId, rowId, setOpenRow, setOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    // 자기 외의 열린 행은 닫는다
    if (openRowId && openRowId !== rowId) setOpenRow(null);
    startX.current = e.clientX;
    startY.current = e.clientY;
    axis.current = 'none';
    hapticFired.current = false;
    settledRef.current = offset;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (disabled || axis.current === 'v') return;
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    if (axis.current === 'none') {
      if (Math.abs(dy) > SCROLL_GUARD && Math.abs(dy) > Math.abs(dx)) {
        axis.current = 'v';
        return;
      }
      if (Math.abs(dx) > 4) {
        axis.current = 'h';
        setDragging(true);
        try {
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore — 합성 이벤트 등에서 throw 가능 */
        }
      } else {
        return;
      }
    }
    // 수평 드래그 중
    let next = settledRef.current + dx;
    // 액션이 없는 방향으로는 끌리지 않게 (살짝 고무줄)
    if (next > 0 && !leftActions) next = 0;
    if (next < 0 && !rightActions) next = 0;
    // 과도하게 끌리지 않게 클램프
    const max = leftActions ? leftRevealWidth + 24 : 0;
    const min = rightActions ? -(rightRevealWidth + 24) : 0;
    next = Math.max(min, Math.min(max, next));
    setOffset(next);
    if (!hapticFired.current && Math.abs(next) >= THRESHOLD) {
      hapticFired.current = true;
      haptic();
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (disabled) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore — 캡처 안 잡혀 있을 수 있음 */
    }
    const wasH = axis.current === 'h';
    axis.current = 'none';
    setDragging(false);
    if (!wasH) return; // 스와이프 아님 (탭 등) — children 의 onClick 이 처리
    const settled = offsetRef.current;
    if (settled >= THRESHOLD && leftActions) {
      setOffset(leftRevealWidth);
      setOpenRow(rowId);
    } else if (settled <= -THRESHOLD && rightActions) {
      setOffset(-rightRevealWidth);
      setOpenRow(rowId);
    } else {
      setOffset(0);
      if (openRowId === rowId) setOpenRow(null);
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* 왼쪽 액션 (오른쪽 스와이프 시 노출) */}
      {leftActions && (
        <div
          className="absolute inset-y-0 left-0 flex items-stretch"
          style={{ width: leftRevealWidth }}
          onClick={close}
        >
          {leftActions}
        </div>
      )}
      {/* 오른쪽 액션 (왼쪽 스와이프 시 노출) */}
      {rightActions && (
        <div
          className="absolute inset-y-0 right-0 flex items-stretch"
          style={{ width: rightRevealWidth }}
          onClick={close}
        >
          {rightActions}
        </div>
      )}
      {/* 행 본문 */}
      <div
        className="relative z-10 bg-sp-bg"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? 'none' : 'transform 200ms ease-out',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {children}
      </div>
    </div>
  );
}

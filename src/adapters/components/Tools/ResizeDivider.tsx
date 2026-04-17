import { useCallback, useEffect, useRef } from 'react';

interface ResizeDividerProps {
  /** 현재 분할 비율(좌측 %, 20~80). 읽기 전용. 변경은 onChange로 통지. */
  ratio: number;
  /** 드래그 중(무단계) 값 */
  onChange: (next: number) => void;
  /** 드래그 종료 직후 한 번 호출 (프리셋 aria-pressed 재계산 등에 사용) */
  onChangeEnd?: () => void;
  /** Container 루트 요소의 현재 폭(px). px ↔ % 변환용. */
  containerWidthPx: number;
  disabled?: boolean;
  minRatio?: number;
  maxRatio?: number;
}

/**
 * 두 슬롯 사이 드래그 핸들. 마우스·터치 모두 지원.
 * 접근성: `role="separator"` + `aria-orientation="vertical"` + 좌/우 화살표 키 조정.
 */
export function ResizeDivider({
  ratio,
  onChange,
  onChangeEnd,
  containerWidthPx,
  disabled = false,
  minRatio = 20,
  maxRatio = 80,
}: ResizeDividerProps) {
  const draggingRef = useRef(false);
  const containerLeftRef = useRef(0);
  const containerWidthRef = useRef(containerWidthPx);
  containerWidthRef.current = containerWidthPx;

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const width = containerWidthRef.current;
      if (width <= 0) return;
      const offset = clientX - containerLeftRef.current;
      const percent = (offset / width) * 100;
      const clamped = Math.max(minRatio, Math.min(maxRatio, percent));
      onChange(Math.round(clamped));
    },
    [onChange, minRatio, maxRatio],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      const parent = e.currentTarget.parentElement;
      if (parent) {
        const rect = parent.getBoundingClientRect();
        containerLeftRef.current = rect.left;
        containerWidthRef.current = rect.width;
      }
      draggingRef.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [disabled],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      e.currentTarget.releasePointerCapture(e.pointerId);
      onChangeEnd?.();
    },
    [onChangeEnd],
  );

  useEffect(() => {
    // 언마운트 시 dragging ref 정리
    return () => {
      draggingRef.current = false;
    };
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onChange(Math.max(minRatio, ratio - 2));
        onChangeEnd?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onChange(Math.min(maxRatio, ratio + 2));
        onChangeEnd?.();
      }
    },
    [disabled, onChange, onChangeEnd, ratio, minRatio, maxRatio],
  );

  if (disabled) return null;

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={ratio}
      aria-valuemin={minRatio}
      aria-valuemax={maxRatio}
      aria-label="슬롯 분할 비율 조정"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={onKeyDown}
      className="w-1.5 shrink-0 mx-1 rounded-full bg-sp-border hover:bg-sp-accent/60 focus-visible:bg-sp-accent active:bg-sp-accent transition-colors cursor-col-resize touch-none"
    />
  );
}

/**
 * 손글씨 서명 캡처 캔버스.
 *
 * - pointer events(마우스/터치/스타일러스)를 모두 처리한다.
 * - 빈 상태는 명시적으로 추적해 "서명 전 제출"을 차단할 수 있게 한다.
 * - 결과는 PNG dataURL로 추출되며 1MB cap을 부드럽게 보장하기 위해 캔버스 크기를
 *   500x180 으로 제한했다 (대략 100KB 이하).
 * - 캔버스가 마운트된 뒤 devicePixelRatio에 맞춰 backing store를 확장해
 *   고해상도 화면에서도 선이 또렷하게 보인다.
 */
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react';

export interface SignatureCanvasPadHandle {
  readonly toDataUrl: (mimeType?: 'image/png' | 'image/webp') => string | null;
  readonly clear: () => void;
  readonly isEmpty: () => boolean;
}

export interface SignatureCanvasPadProps {
  readonly disabled?: boolean;
  readonly onChange?: (hasInk: boolean) => void;
  readonly width?: number;
  readonly height?: number;
  readonly ariaLabel?: string;
}

const DEFAULT_WIDTH = 500;
const DEFAULT_HEIGHT = 180;
const STROKE_COLOR = '#111827';
const STROKE_WIDTH = 2;

export const SignatureCanvasPad = forwardRef<SignatureCanvasPadHandle, SignatureCanvasPadProps>(
  function SignatureCanvasPad(
    { disabled = false, onChange, width = DEFAULT_WIDTH, height = DEFAULT_HEIGHT, ariaLabel },
    ref,
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const [hasInk, setHasInk] = useState(false);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
    }, [width, height]);

    const getCanvasPoint = useCallback((event: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }, []);

    const handlePointerDown = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (disabled) return;
        event.preventDefault();
        const point = getCanvasPoint(event);
        if (!point) return;
        const canvas = canvasRef.current;
        canvas?.setPointerCapture(event.pointerId);
        drawingRef.current = true;
        lastPointRef.current = point;
      },
      [disabled, getCanvasPoint],
    );

    const handlePointerMove = useCallback(
      (event: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current || disabled) return;
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d') ?? null;
        const point = getCanvasPoint(event);
        if (!canvas || !ctx || !point) return;
        const last = lastPointRef.current;
        if (last) {
          ctx.beginPath();
          ctx.moveTo(last.x, last.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        lastPointRef.current = point;
        if (!hasInk) {
          setHasInk(true);
          onChange?.(true);
        }
      },
      [disabled, getCanvasPoint, hasInk, onChange],
    );

    const stopDrawing = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawingRef.current) return;
      drawingRef.current = false;
      lastPointRef.current = null;
      const canvas = canvasRef.current;
      if (canvas?.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId);
      }
    }, []);

    const clear = useCallback(() => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      const ratio = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // 스케일을 다시 적용
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = STROKE_COLOR;
      ctx.lineWidth = STROKE_WIDTH;
      drawingRef.current = false;
      lastPointRef.current = null;
      if (hasInk) {
        setHasInk(false);
        onChange?.(false);
      }
      // 스케일 재적용 (scale은 transform 누적이라 clear 후 setTransform이 reset)
      const ratioFix = ratio;
      ctx.setTransform(ratioFix, 0, 0, ratioFix, 0, 0);
    }, [hasInk, onChange]);

    useImperativeHandle(
      ref,
      () => ({
        toDataUrl: (mimeType = 'image/png') => {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          if (!hasInk) return null;
          return canvas.toDataURL(mimeType);
        },
        clear,
        isEmpty: () => !hasInk,
      }),
      [hasInk, clear],
    );

    return (
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={ariaLabel ?? '서명 입력 영역'}
          aria-disabled={disabled ? 'true' : 'false'}
          className={`block w-full rounded-xl border border-sp-border bg-white touch-none ${
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={stopDrawing}
          onPointerCancel={stopDrawing}
          onPointerLeave={stopDrawing}
        />
        <div className="flex items-center justify-between text-xs">
          <span className="text-sp-muted">
            {hasInk
              ? '서명이 입력됐어요. 다시 그리려면 "지우기"를 눌러 주세요.'
              : '아래 영역에 손가락 또는 마우스로 서명해 주세요.'}
          </span>
          <button
            type="button"
            onClick={clear}
            disabled={disabled || !hasInk}
            className="rounded-lg border border-sp-border px-3 py-1 text-xs font-sp-semibold text-sp-muted hover:border-sp-accent hover:text-sp-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            지우기
          </button>
        </div>
      </div>
    );
  },
);

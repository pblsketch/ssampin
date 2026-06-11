import { useEffect, useImperativeHandle, useRef, forwardRef } from 'react';
import { useChalkCanvas } from '@adapters/components/Tools/Chalkboard/useChalkCanvas';

/**
 * 서명 캔버스 — `useChalkCanvas`(칠판 그리기 훅) 재사용.
 *
 * 칠판 도구와 동일한 Fabric PencilBrush 경로로 손가락/펜 그리기를 받고,
 * `toDataURL('image/png')`로 흰 배경 PNG를 추출한다.
 * 익명 참석자 전용 — Google/교사 코드 의존 없음.
 *
 * 모바일 우선: 컨테이너가 부모 폭을 채우고, touch-action:none 으로 스크롤 충돌을 막는다.
 */

const PAD_PEN_COLOR = '#111827'; // 흰 배경 위 진한 잉크
const PAD_PEN_SIZE = 4;
const PAD_BG = '#ffffff'; // 제출 PNG 배경(흰색)

export interface SignaturePadHandle {
  /** 흰 배경 PNG data URL 반환 (비어있으면 null) */
  exportPng(): string | null;
  /** 캔버스 비었는지 검사 */
  isEmpty(): boolean;
  /** 서명 지우기 */
  clear(): void;
}

interface SignaturePadProps {
  /** 그리기 시작 시 1회 호출 — 안내 placeholder 숨김용 */
  onStrokeStart?: () => void;
}

export const StudentSignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function StudentSignaturePad({ onStrokeStart }, ref) {
    const canvasElRef = useRef<HTMLCanvasElement>(null);
    const startedRef = useRef(false);

    const { initCanvas, clearAll, toDataURL, isCanvasEmpty } = useChalkCanvas({
      canvasElRef,
      mode: 'pen',
      color: PAD_PEN_COLOR,
      penSize: PAD_PEN_SIZE,
      eraserSize: 24,
      boardColor: PAD_BG,
      shapeKind: 'line',
    });

    // 칠판 도구와 동일하게 rAF 후 init (부모 레이아웃 확정 뒤 캔버스 크기 측정).
    useEffect(() => {
      const timer = requestAnimationFrame(initCanvas);
      return () => cancelAnimationFrame(timer);
    }, [initCanvas]);

    useImperativeHandle(
      ref,
      () => ({
        exportPng: () => (isCanvasEmpty() ? null : toDataURL(PAD_BG)),
        isEmpty: () => isCanvasEmpty(),
        clear: () => {
          clearAll();
          startedRef.current = false;
        },
      }),
      [toDataURL, isCanvasEmpty, clearAll],
    );

    const handlePointerDown = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      onStrokeStart?.();
    };

    return (
      <div
        className="relative w-full overflow-hidden rounded-xl border-2 border-sp-border bg-white"
        style={{ aspectRatio: '3 / 2', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
      >
        <canvas ref={canvasElRef} className="absolute inset-0 h-full w-full" />
      </div>
    );
  },
);

/**
 * OverlayHandle — 슬라이드 위 활동 영역 (react-rnd 래핑).
 *
 * - edit 모드: 드래그·리사이즈 가능. 활성 활동(`isActive=true`)은 잠금
 * - present 모드: 드래그·리사이즈 비활성, 응답 영역으로만 표시
 * - onDragStop / onResizeStop에서만 onPositionChange 호출 — 드래그 중 Zustand 재렌더 회피
 *
 * Plan §3 + Design §8.4 매핑.
 */

import { useState, type CSSProperties } from 'react';
import { Rnd } from 'react-rnd';
import type {
  OverlayPosition,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import {
  percentToPx,
  pxToPercent,
  type CanvasDimensions,
  type RndBounds,
} from './SlideCanvas';
import { overlayTypeIcon, overlayTypeLabel } from './SlideCanvas';

export interface OverlayHandleProps {
  readonly overlay: SlideOverlay;
  readonly mode: 'edit' | 'present';
  readonly isSelected: boolean;
  /** 활성 상태 (live 세션에서 학생 응답 받는 중) — edit 모드 잠금 신호 */
  readonly isActive: boolean;
  readonly dims: CanvasDimensions;
  readonly onSelect?: () => void;
  readonly onPositionChange?: (position: OverlayPosition) => void;
  readonly onOpenConfig?: () => void;
}

const STYLE: CSSProperties = {
  // react-rnd 컨테이너에 직접 적용
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function OverlayHandle({
  overlay,
  mode,
  isSelected,
  isActive,
  dims,
  onSelect,
  onPositionChange,
  onOpenConfig,
}: OverlayHandleProps): JSX.Element {
  const pxBounds = percentToPx(overlay.position, dims);
  const [livePreview, setLivePreview] = useState<RndBounds | null>(null);
  const display = livePreview ?? pxBounds;

  const editable = mode === 'edit' && !isActive;
  const ringClass = isSelected
    ? 'ring-2 ring-sp-accent'
    : 'ring-1 ring-sp-border hover:ring-sp-accent/60';
  const stateClass = isActive
    ? 'bg-sp-accent/15 border-sp-accent text-sp-text'
    : 'bg-sp-card/85 border-sp-border text-sp-text';

  return (
    <Rnd
      style={STYLE}
      position={{ x: display.x, y: display.y }}
      size={{ width: display.width, height: display.height }}
      bounds="parent"
      enableResizing={editable}
      disableDragging={!editable}
      onDragStart={() => onSelect?.()}
      onDrag={(_, d) => {
        setLivePreview({
          x: d.x,
          y: d.y,
          width: display.width,
          height: display.height,
        });
      }}
      onDragStop={(_, d) => {
        const next: RndBounds = {
          x: d.x,
          y: d.y,
          width: display.width,
          height: display.height,
        };
        setLivePreview(null);
        onPositionChange?.(pxToPercent(next, dims));
      }}
      onResize={(_, __, ref, ___, position) => {
        setLivePreview({
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        });
      }}
      onResizeStop={(_, __, ref, ___, position) => {
        const next: RndBounds = {
          x: position.x,
          y: position.y,
          width: ref.offsetWidth,
          height: ref.offsetHeight,
        };
        setLivePreview(null);
        onPositionChange?.(pxToPercent(next, dims));
      }}
    >
      <div
        className={`w-full h-full rounded-xl border ${stateClass} ${ringClass} backdrop-blur-sm cursor-pointer transition-all`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (editable) onOpenConfig?.();
        }}
        role="button"
        aria-label={`${overlayTypeLabel(overlay.type)} 활동`}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 p-2 select-none">
          <div className="text-2xl" aria-hidden>
            {overlayTypeIcon(overlay.type)}
          </div>
          <div className="text-xs text-sp-muted">
            {overlayTypeLabel(overlay.type)}
            {overlay.autoActivate && ' · 자동'}
            {isActive && ' · 진행 중'}
          </div>
        </div>
      </div>
    </Rnd>
  );
}

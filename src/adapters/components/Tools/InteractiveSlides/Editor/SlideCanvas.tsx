/**
 * SlideCanvas — 슬라이드 이미지 + 활동 오버레이 렌더 영역.
 *
 * - ResizeObserver로 캔버스 실제 크기를 추적
 * - % 좌표 ↔ px 좌표 변환 (자식 OverlayHandle이 px 값으로 react-rnd 래핑)
 * - 16:9 고정 비율 (object-contain으로 슬라이드 이미지 비율 보존)
 *
 * Plan §3 + Design §8.4 매핑.
 */

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type {
  AggregatedResultData,
  OverlayPosition,
  Slide,
  SlideOverlay,
} from '@domain/entities/InteractiveSlides';
import type { OverlayId } from '@domain/valueObjects/InteractiveSlidesIds';
import { OverlayHandle } from './OverlayHandle';

// ─────────────────────────────────────────────────────────────
// % ↔ px 변환 유틸
// ─────────────────────────────────────────────────────────────

export interface CanvasDimensions {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface RndBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function percentToPx(
  pos: OverlayPosition,
  dims: CanvasDimensions,
): RndBounds {
  return {
    x: (pos.xPercent / 100) * dims.widthPx,
    y: (pos.yPercent / 100) * dims.heightPx,
    width: (pos.widthPercent / 100) * dims.widthPx,
    height: (pos.heightPercent / 100) * dims.heightPx,
  };
}

export function pxToPercent(
  bounds: RndBounds,
  dims: CanvasDimensions,
): OverlayPosition {
  if (dims.widthPx <= 0 || dims.heightPx <= 0) {
    // 캔버스가 아직 측정 전이면 입력을 그대로 보존 (% 0~100 가정)
    return {
      xPercent: bounds.x,
      yPercent: bounds.y,
      widthPercent: bounds.width,
      heightPercent: bounds.height,
    };
  }
  return {
    xPercent: (bounds.x / dims.widthPx) * 100,
    yPercent: (bounds.y / dims.heightPx) * 100,
    widthPercent: (bounds.width / dims.widthPx) * 100,
    heightPercent: (bounds.height / dims.heightPx) * 100,
  };
}

// ─────────────────────────────────────────────────────────────
// SlideCanvas Props
// ─────────────────────────────────────────────────────────────

export interface SlideCanvasProps {
  readonly slide: Slide;
  readonly mode: 'edit' | 'present';
  // edit 모드 props
  readonly selectedOverlayId?: OverlayId | null;
  readonly onOverlaySelect?: (overlayId: OverlayId) => void;
  readonly onOverlayPositionChange?: (
    overlayId: OverlayId,
    position: OverlayPosition,
  ) => void;
  readonly onOverlayOpenConfig?: (overlayId: OverlayId) => void;
  // present 모드 props
  readonly activeOverlayIds?: ReadonlySet<OverlayId>;
  readonly liveResults?: ReadonlyMap<OverlayId, AggregatedResultData>;
  // 추가 children (예: ActivityAddFab)
  readonly children?: ReactNode;
}

export function SlideCanvas({
  slide,
  mode,
  selectedOverlayId,
  onOverlaySelect,
  onOverlayPositionChange,
  onOverlayOpenConfig,
  activeOverlayIds,
  // liveResults: present 모드에서 OverlayHandle 내부 차트 렌더용 — 본 PR에서는 미사용.
  // 다음 PR(LessonPresenter)에서 OverlayHandle에 prop drilling
  children,
}: SlideCanvasProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<CanvasDimensions>({
    widthPx: 0,
    heightPx: 0,
  });

  // ResizeObserver — 창 리사이즈 / 사이드 패널 토글 시 즉시 재측정
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const rect = entry.contentRect;
      setDims({ widthPx: rect.width, heightPx: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // 빈 슬라이드(이미지 미설정) — 안내 텍스트
  const hasImage = slide.imagePath.length > 0;

  return (
    <div className="relative w-full h-full flex items-center justify-center bg-sp-bg overflow-hidden">
      {/* 16:9 고정 컨테이너 */}
      <div
        ref={containerRef}
        className="relative aspect-[16/9] max-w-full max-h-full bg-sp-card border border-sp-border rounded-xl overflow-hidden shadow-sp-md"
        style={{ width: '100%', maxHeight: '100%' }}
        onClick={(e) => {
          // 캔버스 빈 영역 클릭 시 선택 해제
          if (e.target === e.currentTarget && mode === 'edit') {
            onOverlaySelect?.(null as unknown as OverlayId);
          }
        }}
      >
        {hasImage ? (
          <img
            src={slide.imagePath}
            alt={`슬라이드 ${slide.pageNumber}`}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sp-muted text-sm">
            슬라이드 이미지가 아직 없어요. URL을 입력해 주세요.
          </div>
        )}

        {/* 활동 오버레이 핸들 */}
        {dims.widthPx > 0 &&
          slide.overlays.map((overlay) => (
            <OverlayHandle
              key={overlay.id}
              overlay={overlay}
              mode={mode}
              isSelected={selectedOverlayId === overlay.id}
              isActive={activeOverlayIds?.has(overlay.id) ?? false}
              dims={dims}
              {...(onOverlaySelect ? { onSelect: () => onOverlaySelect(overlay.id) } : {})}
              {...(onOverlayPositionChange
                ? {
                    onPositionChange: (pos: OverlayPosition) =>
                      onOverlayPositionChange(overlay.id, pos),
                  }
                : {})}
              {...(onOverlayOpenConfig
                ? { onOpenConfig: () => onOverlayOpenConfig(overlay.id) }
                : {})}
            />
          ))}

        {children}
      </div>
    </div>
  );
}

/** 활동 타입 → 라벨 (한국어 카피 가이드 — Plan §12.4) */
export function overlayTypeLabel(type: SlideOverlay['type']): string {
  switch (type) {
    case 'poll':
      return '투표';
    case 'text':
      return '텍스트 응답';
    case 'wordcloud':
      return '워드클라우드';
    case 'draw':
      return '자유 그리기';
    case 'draggable':
      return '드래그 활동';
  }
}

/** 활동 타입 → 아이콘 이모지 (단순 표시용) */
export function overlayTypeIcon(type: SlideOverlay['type']): string {
  switch (type) {
    case 'poll':
      return '📊';
    case 'text':
      return '✏️';
    case 'wordcloud':
      return '☁️';
    case 'draw':
      return '🎨';
    case 'draggable':
      return '🧩';
  }
}


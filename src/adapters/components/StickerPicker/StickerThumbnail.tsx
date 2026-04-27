import { forwardRef, type ButtonHTMLAttributes } from 'react';
import type { Sticker } from '@domain/entities/Sticker';
import { useStickerImage } from './useStickerImage';

interface StickerThumbnailProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  sticker: Sticker;
  /** 픽셀 크기 (정사각형). 기본 64. */
  size?: number;
  /** 키보드 그리드 포커스 표시 (tabIndex 제어) */
  focused?: boolean;
}

/**
 * 그리드 셀 한 칸의 이모티콘 썸네일.
 *
 * - 이미지 비동기 로드 + 스켈레톤
 * - hover 시 살짝 확대 + accent ring
 * - aria-label 필수 (Sticker.name 자동 매핑)
 * - 키보드 포커스 시 sp-accent ring
 */
export const StickerThumbnail = forwardRef<HTMLButtonElement, StickerThumbnailProps>(
  function StickerThumbnail(
    { sticker, size = 64, focused = false, className = '', onClick, ...rest },
    ref,
  ) {
    const dataUrl = useStickerImage(sticker.id);
    const isLoading = dataUrl === undefined;
    const isMissing = dataUrl === null;

    return (
      <button
        ref={ref}
        type="button"
        role="gridcell"
        aria-label={`${sticker.name} 이모티콘`}
        title={sticker.name}
        tabIndex={focused ? 0 : -1}
        onClick={onClick}
        style={{ width: size, height: size }}
        className={[
          'relative shrink-0 rounded-lg overflow-hidden bg-sp-bg ring-1 ring-sp-border',
          'transition-all duration-sp-quick ease-sp-out',
          'hover:scale-110 hover:ring-sp-accent hover:shadow-sp-md hover:z-10',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-card focus-visible:scale-110',
          'active:scale-95',
          'motion-reduce:transition-none motion-reduce:hover:scale-100',
          className,
        ].filter(Boolean).join(' ')}
        {...rest}
      >
        {isLoading && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-sp-border/30 to-sp-border/10 animate-pulse"
          />
        )}
        {isMissing && !isLoading && (
          <div
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center text-sp-muted"
          >
            <span className="material-symbols-outlined icon-md">broken_image</span>
          </div>
        )}
        {dataUrl && (
          <img
            src={dataUrl}
            alt=""
            draggable={false}
            className="w-full h-full object-contain pointer-events-none select-none"
          />
        )}
      </button>
    );
  },
);

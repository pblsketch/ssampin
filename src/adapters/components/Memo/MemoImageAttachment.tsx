import type { MemoImage } from '@domain/valueObjects/MemoImage';
import { MEMO_IMAGE_LIMITS } from '@domain/valueObjects/MemoImage';

interface MemoImageAttachmentProps {
  image: MemoImage;
  /** 클릭 시 원본 크기 뷰어 열기 */
  onOpenViewer: () => void;
  /** 제거 버튼 콜백 (편집 가능 상태에서만 렌더) */
  onRemove?: () => void;
  /** 썸네일 최대 높이 (기본 MEMO_IMAGE_LIMITS.THUMBNAIL_HEIGHT = 120) */
  maxHeight?: number;
}

export function MemoImageAttachment({ image, onOpenViewer, onRemove, maxHeight }: MemoImageAttachmentProps) {
  const height = maxHeight ?? MEMO_IMAGE_LIMITS.THUMBNAIL_HEIGHT;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenViewer();
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    onRemove?.();
  };

  return (
    <div
      className="relative overflow-hidden rounded-md bg-black/5"
      style={{ height: `${height}px` }}
    >
      <img
        src={image.dataUrl}
        alt={image.fileName}
        className="h-full w-full cursor-zoom-in object-cover transition-opacity hover:opacity-90"
        onClick={handleClick}
        draggable={false}
      />
      {onRemove !== undefined && (
        <button
          type="button"
          onClick={handleRemove}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
          aria-label="이미지 제거"
          title="이미지 제거"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
        </button>
      )}
    </div>
  );
}

import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { MemoImage } from '@domain/valueObjects/MemoImage';

interface MemoImageViewerProps {
  image: MemoImage;
  onClose: () => void;
}

export function MemoImageViewer({ image, onClose }: MemoImageViewerProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleOverlayClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const stopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const viewer = (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/75 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <div className="relative max-h-[90vh] max-w-[90vw]" onClick={stopPropagation}>
        <img
          src={image.dataUrl}
          alt={image.fileName}
          className="max-h-[90vh] max-w-[90vw] object-contain"
          draggable={false}
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg transition-colors hover:bg-slate-100"
          aria-label="닫기"
          title="닫기 (ESC)"
        >
          <span className="material-symbols-outlined">close</span>
        </button>
        <div className="mt-2 text-center text-xs text-white/80">
          {image.fileName} · {image.width}×{image.height}
        </div>
      </div>
    </div>
  );

  return createPortal(viewer, document.body);
}

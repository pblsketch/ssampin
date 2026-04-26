import { useState } from 'react';
import {
  REALTIME_WALL_MAX_IMAGES_PER_POST,
  REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES,
} from '@domain/rules/realtimeWallRules';
import { useStudentImageMultiUpload } from '@student/useStudentImageMultiUpload';

/**
 * v2.1 신규 — 학생 이미지 다중 첨부 picker (Design v2.1 §5.16).
 *
 * - 최대 3장 + 합계 5MB
 * - drop / paste / 파일 picker 3 진입점
 * - 미리보기 + 개별 X 삭제
 * - canvas 리사이즈는 useStudentImageMultiUpload 훅에서
 */

interface StudentImageMultiPickerProps {
  readonly images: readonly string[];
  readonly onAdd: (dataUrl: string) => void;
  readonly onRemove: (index: number) => void;
  readonly maxImages?: number;
  readonly maxTotalBytes?: number;
  readonly disabled?: boolean;
  /** v2.1 PIPA — 첫 이미지 첨부 시 1회 호출. localStorage 플래그 미존재 시 부모가 모달 표시. */
  readonly onPipaConsentNeeded?: () => void;
}

export function StudentImageMultiPicker({
  images,
  onAdd,
  onRemove,
  maxImages = REALTIME_WALL_MAX_IMAGES_PER_POST,
  maxTotalBytes = REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES,
  disabled = false,
  onPipaConsentNeeded,
}: StudentImageMultiPickerProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAdd = (dataUrl: string) => {
    if (images.length === 0 && onPipaConsentNeeded) {
      onPipaConsentNeeded();
    }
    onAdd(dataUrl);
  };

  const { onDrop, onPaste, onFileSelect, error } = useStudentImageMultiUpload({
    currentImages: images,
    onAdd: handleAdd,
    maxImages,
    maxTotalBytes,
  });

  const remaining = maxImages - images.length;
  const totalMB = (maxTotalBytes / 1024 / 1024).toFixed(0);

  return (
    <div>
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {images.map((dataUrl, idx) => (
            <div key={idx} className="relative">
              <img
                src={dataUrl}
                alt={`첨부 이미지 ${idx + 1}`}
                className="rounded-lg max-h-[80px] w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                disabled={disabled}
                className="absolute top-1 right-1 rounded-full bg-black/60 text-white w-5 h-5 text-xs flex items-center justify-center hover:bg-rose-500 disabled:opacity-50"
                aria-label={`이미지 ${idx + 1} 제거`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div
          onDrop={(e) => {
            setIsDragOver(false);
            onDrop(e);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onPaste={onPaste}
          tabIndex={0}
          className={[
            'rounded-lg border-2 border-dashed p-3 text-center transition-colors',
            isDragOver
              ? 'border-sky-400 bg-sky-400/10'
              : 'border-sp-border bg-sp-card/50',
          ].join(' ')}
        >
          <p className="text-xs text-sp-muted mb-2">
            이미지 끌어다 놓기 / Ctrl+V 붙여넣기 ({remaining}장 더 가능)
          </p>
          <label className="inline-block cursor-pointer rounded-lg bg-sp-accent px-3 py-1.5 text-xs text-white hover:bg-sp-accent/90 disabled:opacity-50">
            파일 선택
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={onFileSelect}
              disabled={disabled}
              className="hidden"
            />
          </label>
          <p className="text-caption text-sp-muted mt-2">
            최대 {maxImages}장 / 합계 {totalMB}MB · PNG/JPG/GIF/WebP
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-rose-400 mt-2" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

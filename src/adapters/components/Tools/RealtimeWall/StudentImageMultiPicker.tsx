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
 *
 * compact 모드 (댓글 폼용):
 * - 드롭존 박스·안내 텍스트 제거, 아이콘 버튼만 인라인 표시
 * - compact=true 일 때 onFileSelect를 외부에서 주입 (부모가 훅 소유)
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
  /**
   * compact 모드 — 댓글 폼용.
   * 드롭존 박스·안내 텍스트 제거, 작은 아이콘 버튼만 인라인 표시.
   * compact=true 일 때 onFileSelectOverride를 반드시 전달해야 함.
   * (부모가 useStudentImageMultiUpload 훅을 소유하고 핸들러를 위임)
   */
  readonly compact?: boolean;
  /**
   * compact 모드 전용: 부모(훅)의 onFileSelect를 주입.
   * 이를 통해 picker는 훅을 중복 생성하지 않고 파일 선택만 위임.
   */
  readonly onFileSelectOverride?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** compact 모드 전용: 에러 메시지 (부모 훅에서 관리) */
  readonly externalError?: string | null;
}

export function StudentImageMultiPicker({
  images,
  onAdd,
  onRemove,
  maxImages = REALTIME_WALL_MAX_IMAGES_PER_POST,
  maxTotalBytes = REALTIME_WALL_MAX_IMAGES_TOTAL_BYTES,
  disabled = false,
  onPipaConsentNeeded,
  compact = false,
  onFileSelectOverride,
  externalError,
}: StudentImageMultiPickerProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleAdd = (dataUrl: string) => {
    if (images.length === 0 && onPipaConsentNeeded) {
      onPipaConsentNeeded();
    }
    onAdd(dataUrl);
  };

  // compact 모드에서는 훅을 내부에서 쓰지 않음 — 부모가 훅 소유
  const internalUpload = useStudentImageMultiUpload({
    currentImages: images,
    onAdd: handleAdd,
    maxImages,
    maxTotalBytes,
  });

  const remaining = maxImages - images.length;
  const totalMB = (maxTotalBytes / 1024 / 1024).toFixed(0);

  // compact 모드에서 사용할 파일 선택 핸들러 (외부 주입 우선)
  const fileSelectHandler = compact && onFileSelectOverride
    ? onFileSelectOverride
    : internalUpload.onFileSelect;

  // 표시할 에러 (compact: 외부, 기본: 내부)
  const displayError = compact ? (externalError ?? null) : (internalUpload.error ?? null);

  // ── compact 모드 ──────────────────────────────────────────────
  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {/* 첨부 썸네일 인라인 */}
        {images.map((dataUrl, idx) => (
          <div key={idx} className="relative shrink-0">
            <img
              src={dataUrl}
              alt={`첨부 이미지 ${idx + 1}`}
              className="h-12 w-12 rounded-lg object-cover"
            />
            <button
              type="button"
              onClick={() => onRemove(idx)}
              disabled={disabled}
              className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] text-white hover:bg-rose-500 disabled:opacity-50"
              aria-label={`이미지 ${idx + 1} 제거`}
            >
              ✕
            </button>
          </div>
        ))}

        {/* 파일 선택 아이콘 버튼 */}
        {remaining > 0 && (
          <label
            className={[
              'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-sp-border/50 bg-sp-bg/60 text-sp-muted transition',
              disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-sp-accent/60 hover:text-sp-accent',
            ].join(' ')}
            aria-label="이미지 첨부"
            title="이미지 첨부 (드래그·붙여넣기도 가능)"
          >
            <span className="material-symbols-outlined text-base">attach_file</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={fileSelectHandler}
              disabled={disabled}
              className="hidden"
            />
          </label>
        )}

        {/* 첨부 장수 뱃지 */}
        {images.length > 0 && (
          <span className="text-caption tabular-nums text-sp-muted/70">
            {images.length}/{maxImages}
          </span>
        )}

        {displayError && (
          <span className="text-caption text-rose-400" role="alert">
            {displayError}
          </span>
        )}
      </div>
    );
  }

  // ── 기본(전체) 모드 ───────────────────────────────────────────
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
            internalUpload.onDrop(e);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onPaste={internalUpload.onPaste}
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
              onChange={internalUpload.onFileSelect}
              disabled={disabled}
              className="hidden"
            />
          </label>
          <p className="text-caption text-sp-muted mt-2">
            최대 {maxImages}장 / 합계 {totalMB}MB · PNG/JPG/GIF/WebP
          </p>
        </div>
      )}

      {displayError && (
        <p className="text-xs text-rose-400 mt-2" role="alert">
          {displayError}
        </p>
      )}
    </div>
  );
}

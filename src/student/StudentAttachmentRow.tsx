import { useRef } from 'react';
import type React from 'react';

/**
 * v2.2 (Bug 2 Fix) — Padlet 스타일 첨부 진입점 행.
 *
 * 5 버튼 (활성 2 + 비활성 3):
 *   - upload (이미지/PDF) — 활성
 *   - photo_camera — 비활성 (v3 예정)
 *   - draw — 비활성 (v3 예정)
 *   - link — 활성 (toggle)
 *   - search — 비활성 (v3 예정)
 *
 * 회귀 위험 #6 격리 — keyboard shortcut 미사용.
 * 이미지 5장 제한 도달 시 upload 버튼만 비활성, 나머지는 그대로.
 */

interface StudentAttachmentRowProps {
  readonly onUpload: (files: FileList) => void;
  readonly onLinkClick: () => void;
  readonly disabled?: boolean;
  readonly hasReachedImageMax?: boolean;
}

export function StudentAttachmentRow({
  onUpload,
  onLinkClick,
  disabled = false,
  hasReachedImageMax = false,
}: StudentAttachmentRowProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleUploadClick = () => {
    if (disabled) return;
    fileInputRef.current?.click();
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) onUpload(files);
    e.target.value = '';
  };

  const buttonClass = (active: boolean) =>
    [
      'inline-flex h-9 w-9 items-center justify-center rounded-lg border transition',
      active && !disabled
        ? 'border-sp-border bg-sp-card text-sp-text hover:border-sp-accent/50 hover:text-sp-accent'
        : 'border-sp-border/40 bg-sp-card/50 text-sp-muted/50 cursor-not-allowed',
    ].join(' ');

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-lg border-2 border-dashed border-sp-border p-3">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
        <button
          type="button"
          onClick={handleUploadClick}
          disabled={disabled || hasReachedImageMax}
          aria-label="이미지 또는 PDF 첨부"
          title={hasReachedImageMax ? '이미지 5장이 가득 찼어요' : '이미지 또는 PDF 첨부'}
          className={buttonClass(!hasReachedImageMax)}
        >
          <span className="material-symbols-outlined text-[18px]">upload</span>
        </button>
        <button
          type="button"
          disabled
          aria-disabled
          aria-label="카메라 (준비 중)"
          title="카메라 (v3 예정)"
          className={buttonClass(false)}
        >
          <span className="material-symbols-outlined text-[18px]">photo_camera</span>
        </button>
        <button
          type="button"
          disabled
          aria-disabled
          aria-label="그리기 (준비 중)"
          title="그리기 (v3 예정)"
          className={buttonClass(false)}
        >
          <span className="material-symbols-outlined text-[18px]">draw</span>
        </button>
        <button
          type="button"
          onClick={onLinkClick}
          disabled={disabled}
          aria-label="링크 추가"
          title="링크 추가"
          className={buttonClass(true)}
        >
          <span className="material-symbols-outlined text-[18px]">link</span>
        </button>
        <button
          type="button"
          disabled
          aria-disabled
          aria-label="검색 (준비 중)"
          title="검색 (v3 예정)"
          className={buttonClass(false)}
        >
          <span className="material-symbols-outlined text-[18px]">search</span>
        </button>
      </div>
      <p className="text-center text-xs text-sp-muted">
        이미지, PDF, 링크를 추가해 보세요
      </p>
    </div>
  );
}

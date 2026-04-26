import { useRef } from 'react';
import type React from 'react';

/**
 * v2.3 — Padlet 스타일 첨부 진입점 행 (실제 지원 타입만 노출).
 *
 * 3 버튼 (모두 활성, 실제 지원 첨부와 1:1 일치):
 *   - upload (이미지/PDF) — 활성
 *   - link — 활성 (toggle)
 *
 * v2.2까지 노출되던 photo_camera/draw/search 버튼은 미구현으로 제거 (2026-04-26).
 * 안내문 "이미지, PDF, 링크를 추가해 보세요"는 그대로 유지.
 *
 * 회귀 위험 #6 격리 — keyboard shortcut 미사용.
 * 이미지 5장 제한 도달 시 upload 버튼만 비활성, 링크는 그대로.
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
          onClick={onLinkClick}
          disabled={disabled}
          aria-label="링크 추가"
          title="링크 추가"
          className={buttonClass(true)}
        >
          <span className="material-symbols-outlined text-[18px]">link</span>
        </button>
      </div>
      <p className="text-center text-xs text-sp-muted">
        이미지, PDF, 링크를 추가해 보세요
      </p>
    </div>
  );
}

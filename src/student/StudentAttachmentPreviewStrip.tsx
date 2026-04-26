/**
 * v2.2 (Bug 2 Fix) — 첨부 미리보기 스트립.
 *
 * 이미지(thumbnail) + PDF(파일명 칩) + 링크(URL 칩) 통합 표시.
 * 빈 상태이면 null 반환 (자리 점유 X).
 *
 * 회귀 위험 #6 격리 — keyboard shortcut 미사용.
 * isSubmitting 시 모든 제거 버튼 disabled.
 */

interface StudentAttachmentPreviewStripProps {
  readonly images: readonly string[];
  readonly pdfFilename?: string;
  readonly linkUrl?: string;
  readonly onRemoveImage: (index: number) => void;
  readonly onRemovePdf: () => void;
  readonly onRemoveLink: () => void;
  readonly disabled?: boolean;
}

export function StudentAttachmentPreviewStrip({
  images,
  pdfFilename,
  linkUrl,
  onRemoveImage,
  onRemovePdf,
  onRemoveLink,
  disabled = false,
}: StudentAttachmentPreviewStripProps) {
  if (images.length === 0 && !pdfFilename && !linkUrl) return null;

  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-sp-border bg-sp-surface/40 p-2">
      {images.map((src, idx) => (
        <div
          key={`img-${idx}`}
          className="relative h-16 w-16 overflow-hidden rounded-lg border border-sp-border"
        >
          <img
            src={src}
            alt={`첨부 이미지 ${idx + 1}`}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => onRemoveImage(idx)}
            disabled={disabled}
            aria-label={`이미지 ${idx + 1} 제거`}
            title="제거"
            className="absolute right-0.5 top-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[12px]">close</span>
          </button>
        </div>
      ))}
      {pdfFilename && (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs text-sp-text">
          <span className="material-symbols-outlined text-[14px] text-sp-accent">
            picture_as_pdf
          </span>
          <span className="max-w-[140px] truncate">{pdfFilename}</span>
          <button
            type="button"
            onClick={onRemovePdf}
            disabled={disabled}
            aria-label="PDF 제거"
            title="PDF 제거"
            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-sp-muted hover:bg-sp-text/10 hover:text-sp-text disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[10px]">close</span>
          </button>
        </div>
      )}
      {linkUrl && (
        <div className="inline-flex items-center gap-1.5 rounded-lg border border-sp-border bg-sp-card px-2.5 py-1.5 text-xs text-sp-text">
          <span className="material-symbols-outlined text-[14px] text-sp-accent">link</span>
          <span className="max-w-[180px] truncate">{linkUrl}</span>
          <button
            type="button"
            onClick={onRemoveLink}
            disabled={disabled}
            aria-label="링크 제거"
            title="링크 제거"
            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-sp-muted hover:bg-sp-text/10 hover:text-sp-text disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[10px]">close</span>
          </button>
        </div>
      )}
    </div>
  );
}

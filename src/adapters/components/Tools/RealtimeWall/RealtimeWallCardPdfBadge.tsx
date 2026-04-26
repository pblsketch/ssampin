/**
 * v2.1 신규 — 카드 PDF 첨부 badge (Design v2.1 §5.4).
 *
 * - PDF 아이콘 + 파일명
 * - 클릭 시 새 탭으로 file:// URL 열기
 * - filename은 Main 프로세스에서 sanitize된 안전한 값
 */

interface RealtimeWallCardPdfBadgeProps {
  readonly pdfUrl: string;
  readonly pdfFilename: string;
}

export function RealtimeWallCardPdfBadge({
  pdfUrl,
  pdfFilename,
}: RealtimeWallCardPdfBadgeProps) {
  if (!pdfUrl) return null;
  return (
    <a
      href={pdfUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card/80 px-3 py-2 text-xs text-sp-text hover:border-sp-accent hover:text-sp-accent transition-colors"
      title={pdfFilename}
    >
      <span aria-hidden="true">📄</span>
      <span className="truncate max-w-[180px]">{pdfFilename}</span>
    </a>
  );
}

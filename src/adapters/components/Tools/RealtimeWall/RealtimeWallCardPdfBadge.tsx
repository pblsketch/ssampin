/**
 * v2.1 신규 — 카드 PDF 첨부 badge (Design v2.1 §5.4).
 *
 * - PDF 아이콘 + 파일명
 * - 클릭 시 새 탭으로 file:// URL 열기
 * - filename은 Main 프로세스에서 sanitize된 안전한 값
 */

import type { MouseEvent } from 'react';

interface RealtimeWallCardPdfBadgeProps {
  readonly pdfUrl: string;
  readonly pdfFilename: string;
}

/**
 * file:// URL을 로컬 파일 경로로 변환.
 * Windows(file:///C:/…)는 앞 슬래시 제거, Posix(file:///tmp/…)는 그대로 둔다.
 */
function fileUrlToLocalPath(fileUrl: string): string {
  const pathname = decodeURIComponent(new URL(fileUrl).pathname);
  return /^\/[A-Za-z]:/.test(pathname) ? pathname.slice(1) : pathname;
}

/**
 * PDF badge 클릭 처리. Electron 데스크톱에서는 file:// 을 shell.openExternal이 거부하므로,
 * temp 화이트리스트를 통과하는 openPath로 OS 기본 PDF 뷰어에서 연다
 * (`<a target="_blank">`는 보안 가드에 막힘). 브라우저(학생 웹)에서는 electronAPI가 없어
 * 기본 `<a>` 동작을 그대로 둔다.
 */
function handlePdfClick(e: MouseEvent<HTMLAnchorElement>, pdfUrl: string): void {
  const api = window.electronAPI;
  if (api?.openPath && pdfUrl.startsWith('file://')) {
    e.preventDefault();
    void api.openPath(fileUrlToLocalPath(pdfUrl));
  }
}

export function RealtimeWallCardPdfBadge({ pdfUrl, pdfFilename }: RealtimeWallCardPdfBadgeProps) {
  if (!pdfUrl) return null;
  return (
    <a
      href={pdfUrl}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => handlePdfClick(e, pdfUrl)}
      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sp-border bg-sp-card/80 px-3 py-2 text-xs text-sp-text hover:border-sp-accent hover:text-sp-accent transition-colors"
      title={pdfFilename}
    >
      <span aria-hidden="true">📄</span>
      <span className="truncate max-w-[180px]">{pdfFilename}</span>
    </a>
  );
}

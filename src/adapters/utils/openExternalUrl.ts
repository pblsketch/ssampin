import type { MouseEvent } from 'react';

/**
 * 외부 URL을 OS 기본 브라우저에서 연다.
 *
 * Electron 데스크톱에서는 보안 가드(`electron/security-guards.ts`의
 * `setWindowOpenHandler`)가 `window.open`과 `<a target="_blank">` 클릭을 모두
 * deny한다. 따라서 외부 링크는 반드시 `shell:openExternal` IPC
 * (`window.electronAPI.openExternal`)를 거쳐야 열린다.
 * 브라우저(웹/모바일) 모드에서는 electronAPI가 없어 `window.open`으로 열고,
 * 팝업이 차단되면 임시 `<a>` 클릭으로 폴백한다.
 */
export function openExternalUrl(url: string): void {
  if (!url) return;
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  }
}

/**
 * 외부 링크 `<a>`의 onClick 핸들러. 기본 이동/새 창을 막고 `openExternalUrl`로
 * 위임해 데스크톱·웹 어디서나 OS 브라우저에서 열리게 한다.
 * `url`을 명시하지 않으면 앵커의 href를 사용한다.
 */
export function handleExternalLinkClick(e: MouseEvent<HTMLAnchorElement>, url?: string): void {
  const href = url ?? e.currentTarget.href;
  if (!href) return;
  e.preventDefault();
  openExternalUrl(href);
}

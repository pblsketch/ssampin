/**
 * BrowserWindow Drop → file:// Navigate 크래시 방지 가드 (defense in depth).
 *
 * 사용자 신고(2026-05-07): `바탕화면 정리` 위젯 박스에 파일/폴더를 드롭하면
 * 빨간 동그라미 빗금(🚫) 커서 후 앱이 통째로 unload된다.
 *
 * 근본 원인:
 *   Electron 기본 동작 — dragover/drop을 누구도 preventDefault 안 하면 드롭된
 *   파일의 `file:///path/to/dropped.pptx` URL로 BrowserWindow를 navigate.
 *   React 렌더러가 통째로 unload되어 사용자 입장에서는 앱 강제 종료처럼 보인다.
 *
 * 해결 (2-layer defense):
 *   1) renderer 측 — installDropGuard(): window 레벨 dragover/drop preventDefault.
 *      bubble 단계 등록 → 의도된 drop 컴포넌트(BookmarkCard, StickerUploader 등)가
 *      stopPropagation()을 호출하면 본 listener는 호출되지 않음 (회귀 0건).
 *   2) main 측 — installNavigationGuard(win): webContents의 will-navigate에서
 *      file://(자기 자신 dist/index.html 제외) 차단 + setWindowOpenHandler로
 *      외부 윈도우 오픈 deny.
 *
 * 두 가드 모두 idempotent — 같은 이벤트에 preventDefault가 여러 번 호출돼도 무해.
 *
 * 본 파일은 preload.ts(renderer) + main.ts(main) 양쪽에서 import하며,
 * 단일 진실 원천(SSOT)으로 가드 로직을 보관한다.
 *
 * Design 문서: docs/02-design/features/desktop-organize-drop-crash-fix.design.md §3.1, §3.2
 */

import type { BrowserWindow } from 'electron';

/**
 * Renderer 측 — window 레벨 dragover/drop preventDefault.
 *
 * preload.ts에서 1회 호출. 모든 5개 BrowserWindow(main, widget, icon, quickAdd,
 * stickerPicker)가 동일 preload.js를 공유하므로 본 함수 1회 호출로 전체 보호.
 *
 * **bubble 단계** 등록 (3rd arg = false):
 *   React 합성 이벤트는 React 17+에서 document에 위임됨. React 핸들러가 먼저
 *   처리하고 e.stopPropagation()을 호출하면 window까지 도달하지 않음 → 의도된
 *   drop 컴포넌트(BookmarkCard, BookmarkGroupCard, StickerManager,
 *   StickerUploader, FormUploadModal, StudentImageMultiPicker 등) 회귀 0건.
 *
 * **idempotent**: 본 함수가 두 번 호출되면 listener가 2개 등록될 뿐, 동작은 동일.
 * 다만 preload는 BrowserWindow lifetime 동안 1회만 실행되므로 실제 중복은 없음.
 */
export function installDropGuard(): void {
  const block = (e: DragEvent): void => {
    e.preventDefault();
  };
  window.addEventListener('dragover', block, false);
  window.addEventListener('drop', block, false);
}

/**
 * Main 측 — BrowserWindow의 webContents에서 file:// navigate + 외부 윈도우 오픈 차단.
 *
 * **호출 시점**: BrowserWindow 생성 직후, 첫 navigation 이전.
 *
 * **허용 navigate**:
 *   - 개발 서버 (process.env.VITE_DEV_SERVER_URL) 시작 URL
 *   - 자기 자신 dist/index.html (해시/쿼리만 변경되는 라우팅)
 *
 * **차단 navigate**:
 *   - 그 외 모든 file:// — 사용자가 드롭한 임의 파일 경로
 *   - 외부 http(s):// — shell.openExternal IPC 채널을 통해서만 오픈
 *
 * **setWindowOpenHandler**: 모든 신규 윈도우 오픈 deny. 정당한 외부 링크는
 * 기존 'shell:openExternal' IPC 채널 패턴을 사용.
 *
 * **로그**: 차단 시 console.warn — 토스트는 띄우지 않음 (사용자 혼란 방지).
 *   디버깅용으로 main 콘솔 출력만 남기고, renderer는 그냥 무동작.
 *
 * @param win 가드를 적용할 BrowserWindow 인스턴스
 */
export function installNavigationGuard(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    // 허용 1: 개발 서버 prefix
    const devUrl = process.env['VITE_DEV_SERVER_URL'] ?? '';
    if (devUrl && url.startsWith(devUrl)) return;

    // 허용 2: 자기 자신 dist/index.html 라우팅 (해시/쿼리 변경)
    //   - currentUrl이 file:///.../dist/index.html#/foo 일 때
    //     url=file:///.../dist/index.html#/bar 이면 통과 (라우팅 정상)
    //   - currentUrl과 base path가 같으면 동일 페이지로 간주
    if (url.startsWith('file://')) {
      const currentUrl = win.webContents.getURL();
      const stripFragment = (u: string): string =>
        u.split('#')[0]!.split('?')[0]!;
      if (currentUrl && stripFragment(url) === stripFragment(currentUrl)) {
        return;
      }
    }

    // 차단: 그 외 모든 navigate
    console.warn('[security] blocked navigation:', url);
    event.preventDefault();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // 외부 윈도우 오픈은 모두 deny.
    // 정당한 외부 링크는 기존 'shell:openExternal' IPC 채널을 통해서만 오픈.
    console.warn('[security] denied window.open:', url);
    return { action: 'deny' };
  });
}

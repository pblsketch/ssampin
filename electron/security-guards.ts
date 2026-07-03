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
import { MINIAPP_PARTITION } from './miniapp-protocol';

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
      const stripFragment = (u: string): string => u.split('#')[0]!.split('?')[0]!;
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

/**
 * webview attach 시 신뢰 경계를 main이 보증하도록 webPreferences를 강제 봉합(순수함수).
 *
 * **모든 webview 대상**(미니앱·기존 외부 쌤도구 공통):
 *   - `preload`/`preloadURL` 삭제 → 어떤 preload도 상속되지 않음(쌤핀 IPC 채널 원천 미노출).
 *   - `nodeIntegration=false` / `contextIsolation=true` → Node·require 접근 차단.
 *
 * 렌더러 JSX가 위조돼도 main이 이 사실을 덮어쓰므로, "preload 미부착"이 렌더러의 약속이
 * 아니라 **main의 보증 사실**이 된다(Electron 보안 권고). `webPreferences`는 Electron이
 * attach 후 참조하는 같은 객체이므로 여기서의 변경이 그대로 적용된다.
 */
export function hardenWebviewPreferences(webPreferences: Record<string, unknown>): void {
  delete webPreferences['preload'];
  delete webPreferences['preloadURL'];
  webPreferences['nodeIntegration'] = false;
  webPreferences['contextIsolation'] = true;
}

/**
 * 미니앱 webview attach를 거부해야 하는지 판정(순수함수).
 *
 * `persist:miniapps` partition인데 src가 `miniapp://`가 아니면 차단 대상이다
 * (미니앱 세션으로 외부/임의 스킴을 로드하려는 시도 차단).
 *
 * ⚠️ **기존 외부 쌤도구 회귀 금지:** partition이 `persist:miniapps`가 아니면
 * (예: `persist:tools`의 외부 https 도구) 항상 false를 반환해 차단하지 않는다.
 */
export function shouldBlockMiniAppAttach(
  partition: string | undefined,
  src: string | undefined,
): boolean {
  return partition === MINIAPP_PARTITION && (!src || !src.startsWith('miniapp://'));
}

/**
 * 대상 WebContents(보통 mainWindow.webContents)에 `will-attach-webview` 강제 가드를 설치한다.
 *
 * **호출 시점**: BrowserWindow 생성 직후(installNavigationGuard 다음). 첫 webview attach 이전.
 *
 * 두 책임을 분리한다:
 *   (a) 전체 webview — {@link hardenWebviewPreferences}로 preload strip·Node 차단(기존 도구 포함).
 *   (b) 미니앱 partition에만 — `sandbox=true` 강제 + `miniapp://` 외 src attach 거부.
 *       기존 `persist:tools` 외부 https 도구는 (b)에 걸리지 않아 동작이 바뀌지 않는다.
 *
 * @param contents 가드를 설치할 WebContents (미니앱 `<webview>`의 호스트 페이지).
 */
export function installMiniAppWebviewGuard(contents: import('electron').WebContents): void {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // (a) 전체 webview 대상 — preload 미부착·Node 차단을 main이 보증.
    hardenWebviewPreferences(webPreferences as unknown as Record<string, unknown>);

    // (b) 미니앱 partition에만 — sandbox 강제.
    if (params.partition === MINIAPP_PARTITION) {
      (webPreferences as unknown as Record<string, unknown>)['sandbox'] = true;
    }

    // (b) 미니앱 partition + 비-miniapp:// src면 attach 거부(기존 외부 쌤도구는 미차단).
    if (shouldBlockMiniAppAttach(params.partition, params.src)) {
      event.preventDefault();
      console.warn('[miniapp] blocked attach:', params.src);
    }
  });
}

/**
 * attach된 미니앱 webContents가 자기 origin(miniapp://) 밖으로 이동하려는지 판정(순수함수).
 *
 * 미니앱은 자기 `miniapp://<id>/...` 안에서만 움직여야 한다. http(s) 등 외부로의 top-level
 * 이동은 프레임 탈취·피싱 표면이므로 차단하고, 정당한 외부 링크는 OS 브라우저로 넘긴다.
 */
export function shouldBlockMiniAppNavigation(url: string): boolean {
  return !url.startsWith('miniapp://');
}

/**
 * attach된 **미니앱 webContents**에 외부 이동/새창 차단을 건다(방어심도, 계획 §3 SSOT).
 *
 * `will-attach-webview`(preload strip·sandbox)에 더해, attach 이후의 top-level navigation과
 * `window.open`까지 miniapp:// 내부로 가둔다. 외부 http(s)는 deny하고 `openExternal`로 OS
 * 브라우저에 위임한다(주입 — 이 파일은 preload와 공유되므로 `shell`/`session`을 직접 import하지 않음).
 *
 * **호출 위치**: main 프로세스에서 host의 `did-attach-webview` 시, 해당 webContents의 세션이
 * 미니앱 partition일 때만 호출한다(기존 `persist:tools` 외부 https 도구에는 걸지 않는다).
 *
 * @param contents attach된 미니앱 `<webview>`의 webContents
 * @param openExternal 정당한 외부 링크를 OS 브라우저로 여는 함수(보통 `shell.openExternal`)
 */
export function installMiniAppContentNavGuard(
  contents: import('electron').WebContents,
  openExternal: (url: string) => void,
): void {
  contents.on('will-navigate', (event, url) => {
    if (shouldBlockMiniAppNavigation(url)) {
      event.preventDefault();
      console.warn('[miniapp] blocked navigation:', url);
      if (/^https?:\/\//i.test(url)) {
        openExternal(url);
      }
    }
  });

  contents.setWindowOpenHandler(({ url }) => {
    // 미니앱 안에서의 새 창은 모두 deny. 정당한 외부 링크만 OS 브라우저로 위임.
    if (/^https?:\/\//i.test(url)) {
      openExternal(url);
    }
    return { action: 'deny' };
  });
}

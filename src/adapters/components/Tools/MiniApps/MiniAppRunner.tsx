import { useState, useRef, useEffect, useCallback } from 'react';
import { ToolLayout } from '../ToolLayout';
import type { MiniApp } from '@domain/entities/MiniApp';

/**
 * 미니앱 실행기 — 교사가 등록한 단일 HTML 앱을 격리 `<webview>`로 구동한다.
 *
 * 격리 보증(§3, main이 강제):
 *  - `partition="persist:miniapps"` — 본체와 스토리지 분리(앱 간 격리는 origin SOP).
 *  - **`allowpopups`·`preload` 미부착** — 팝업·쌤핀 IPC 채널 원천 차단. main의
 *    `installMiniAppWebviewGuard`(will-attach-webview)가 preload strip·sandbox를 다시 보증한다.
 *  - `src=miniapp://<id>/index.html` — 커스텀 프로토콜 핸들러가 경로검증 + CSP enforce.
 *
 * 위화감 없는 렌더링(§4): ToolLayout 프레임 + 흰 배경·경계선으로 "의도된 창"처럼 보이게,
 * 로딩 스피너·표준 에러 카드·크래시 복구 카드로 흰 화면을 노출하지 않는다.
 * webview는 CSS zoom transform과 충돌하므로 `disableZoom`으로 프레임 배율을 끈다.
 */

interface WebviewElement extends HTMLElement {
  reload(): void;
}

interface MiniAppRunnerProps {
  app: MiniApp;
  onBack: () => void;
  isFullscreen: boolean;
}

type RunStatus = 'loading' | 'ready' | 'error' | 'crashed';

export function MiniAppRunner({ app, onBack, isFullscreen }: MiniAppRunnerProps) {
  const webviewRef = useRef<WebviewElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState<RunStatus>('loading');

  const src = `miniapp://${app.id}/index.html`;
  const emoji = app.icon.kind === 'emoji' ? app.icon.value : '🧩';

  const reload = useCallback(() => {
    setStatus('loading');
    setIsLoading(true);
    webviewRef.current?.reload();
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // 12초 후에도 로딩 중이면 강제로 표시(폴백).
    const timeoutId = setTimeout(() => setIsLoading(false), 12000);
    const stopLoading = () => {
      clearTimeout(timeoutId);
      setIsLoading(false);
    };

    const onDomReady = () => {
      stopLoading();
      setStatus('ready');
    };
    const onFinishLoad = () => stopLoading();
    const onFailLoad = (e: Event) => {
      const errorCode = (e as Event & { errorCode: number }).errorCode;
      // -3(ABORTED), 0(성공)은 정상 흐름 — 무시.
      if (errorCode !== 0 && errorCode !== -3) {
        clearTimeout(timeoutId);
        setIsLoading(false);
        setStatus('error');
      }
    };
    // 미니앱 프로세스가 죽거나 응답하지 않으면 복구 카드로 전환(앱 전체가 아니라 이 앱만).
    const onGone = () => {
      clearTimeout(timeoutId);
      setIsLoading(false);
      setStatus('crashed');
    };

    webview.addEventListener('dom-ready', onDomReady);
    webview.addEventListener('did-finish-load', onFinishLoad);
    webview.addEventListener('did-fail-load', onFailLoad);
    webview.addEventListener('render-process-gone', onGone);
    webview.addEventListener('unresponsive', onGone);
    webview.addEventListener('crashed', onGone);

    return () => {
      clearTimeout(timeoutId);
      webview.removeEventListener('dom-ready', onDomReady);
      webview.removeEventListener('did-finish-load', onFinishLoad);
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('render-process-gone', onGone);
      webview.removeEventListener('unresponsive', onGone);
      webview.removeEventListener('crashed', onGone);
    };
  }, [app.id]);

  const showRecovery = status === 'error' || status === 'crashed';

  return (
    <ToolLayout
      title={app.name}
      emoji={emoji}
      onBack={onBack}
      isFullscreen={isFullscreen}
      disableZoom
    >
      <div
        className="flex-1 relative rounded-xl overflow-hidden border border-sp-border bg-white"
        style={{ minHeight: 'calc(100vh - 200px)' }}
      >
        {/* 로딩 스피너 — 흰 화면 대신 항상 무언가 보이게 */}
        {isLoading && !showRecovery && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-sp-card">
            <div className="animate-spin rounded-full h-10 w-10 border-2 border-sp-border border-t-sp-accent" />
          </div>
        )}

        {/* 로드 실패 카드 */}
        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-sp-card text-sp-muted">
            <span className="material-symbols-outlined text-5xl">broken_image</span>
            <p className="text-sm">앱을 불러올 수 없습니다</p>
            <button
              onClick={reload}
              className="px-3 py-1.5 text-sm bg-sp-accent/20 hover:bg-sp-accent/30 rounded-lg text-sp-accent transition-colors"
            >
              다시 시도
            </button>
          </div>
        )}

        {/* 크래시/무응답 복구 카드 */}
        {status === 'crashed' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-sp-card text-sp-muted">
            <span className="material-symbols-outlined text-5xl">sync_problem</span>
            <p className="text-sm">앱이 응답하지 않아요</p>
            <button
              onClick={reload}
              className="px-3 py-1.5 text-sm bg-sp-accent/20 hover:bg-sp-accent/30 rounded-lg text-sp-accent transition-colors"
            >
              새로고침
            </button>
          </div>
        )}

        {/* 미니앱 격리 webview — preload·allowpopups 미부착(main이 sandbox 강제) */}
        {!showRecovery && (
          <webview
            ref={webviewRef as React.Ref<HTMLElement>}
            src={src}
            partition="persist:miniapps"
            className="absolute inset-0 w-full h-full"
            style={{ visibility: isLoading ? 'hidden' : 'visible' }}
          />
        )}
      </div>
    </ToolLayout>
  );
}

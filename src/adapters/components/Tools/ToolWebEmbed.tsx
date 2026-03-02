import { useState, useRef, useEffect, useCallback } from 'react';
import { ToolLayout } from './ToolLayout';

interface ToolWebEmbedProps {
  url: string;
  title: string;
  onBack: () => void;
  isFullscreen: boolean;
}

interface WebviewElement extends HTMLElement {
  goBack(): void;
  goForward(): void;
  reload(): void;
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: {
        src?: string;
        allowpopups?: string;
        partition?: string;
        className?: string;
        style?: React.CSSProperties;
        ref?: React.Ref<HTMLElement>;
      };
    }
  }
}

const BTN = 'p-1 rounded text-sp-muted hover:text-white hover:bg-white/10 transition-all';

export function ToolWebEmbed({ url, title, onBack, isFullscreen }: ToolWebEmbedProps) {
  const webviewRef = useRef<WebviewElement>(null);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const openExternal = useCallback((targetUrl: string) => {
    window.electronAPI?.openExternal(targetUrl);
  }, []);

  const goBack = useCallback(() => webviewRef.current?.goBack(), []);
  const goForward = useCallback(() => webviewRef.current?.goForward(), []);
  const reload = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    webviewRef.current?.reload();
  }, []);

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    // 타임아웃 폴백: 12초 후에도 로딩 중이면 강제로 표시
    const timeoutId = setTimeout(() => setIsLoading(false), 12000);

    const stopLoading = () => {
      clearTimeout(timeoutId);
      setIsLoading(false);
    };

    const onStartLoading = () => {
      setIsLoading(true);
      setHasError(false);
    };
    // dom-ready: DOM이 준비되면 표시 (SPA 포함 가장 신뢰성 높음)
    const onDomReady = () => stopLoading();
    // did-finish-load: 네비게이션 완료 시 폴백
    const onFinishLoad = () => stopLoading();
    const onFailLoad = (e: Event) => {
      const errorCode = (e as Event & { errorCode: number }).errorCode;
      if (errorCode !== 0 && errorCode !== -3) {
        clearTimeout(timeoutId);
        setIsLoading(false);
        setHasError(true);
      }
    };
    const onNavigate = (e: Event) => {
      const ev = e as Event & { url: string };
      if (ev.url) setCurrentUrl(ev.url);
    };

    webview.addEventListener('did-start-loading', onStartLoading);
    webview.addEventListener('dom-ready', onDomReady);
    webview.addEventListener('did-finish-load', onFinishLoad);
    webview.addEventListener('did-fail-load', onFailLoad);
    webview.addEventListener('did-navigate', onNavigate);
    webview.addEventListener('did-navigate-in-page', onNavigate);

    return () => {
      clearTimeout(timeoutId);
      webview.removeEventListener('did-start-loading', onStartLoading);
      webview.removeEventListener('dom-ready', onDomReady);
      webview.removeEventListener('did-finish-load', onFinishLoad);
      webview.removeEventListener('did-fail-load', onFailLoad);
      webview.removeEventListener('did-navigate', onNavigate);
      webview.removeEventListener('did-navigate-in-page', onNavigate);
    };
  }, []);

  // Extract leading emoji for ToolLayout's emoji prop
  const emojiMatch = title.match(/^\p{Emoji_Presentation}/u) ?? title.match(/^./u);
  const emoji = emojiMatch ? emojiMatch[0] : '🌐';
  const displayTitle = title.replace(emoji, '').trim();

  return (
    <ToolLayout title={displayTitle} emoji={emoji} onBack={onBack} isFullscreen={isFullscreen}>
      <div className="flex flex-col gap-2" style={{ minHeight: 'calc(100vh - 180px)' }}>
        {/* Mini navigation bar */}
        <div className="flex items-center gap-0.5 h-8 bg-white/5 rounded-lg px-2 shrink-0">
          <button onClick={goBack} className={BTN} title="뒤로">
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
          </button>
          <button onClick={goForward} className={BTN} title="앞으로">
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
          <button onClick={reload} className={BTN} title="새로고침">
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
          <span className="flex-1 text-center text-xs text-sp-muted truncate px-3 select-text">
            {currentUrl}
          </span>
          <button
            onClick={() => openExternal(currentUrl)}
            className={BTN}
            title="브라우저에서 열기"
          >
            <span className="material-symbols-outlined text-[16px]">open_in_new</span>
          </button>
        </div>

        {/* Main web area */}
        <div className="flex-1 relative rounded-xl overflow-hidden" style={{ minHeight: 'calc(100vh - 240px)' }}>
          {isLoading && !hasError && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-sp-card rounded-xl">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-sp-border border-t-sp-accent" />
            </div>
          )}
          {hasError ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-sp-card rounded-xl text-sp-muted">
              <span className="material-symbols-outlined text-5xl">wifi_off</span>
              <p className="text-sm">페이지를 불러올 수 없습니다</p>
              <div className="flex gap-2">
                <button
                  onClick={reload}
                  className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
                >
                  다시 시도
                </button>
                <button
                  onClick={() => openExternal(currentUrl)}
                  className="px-3 py-1.5 text-sm bg-sp-accent/20 hover:bg-sp-accent/30 rounded-lg text-sp-accent transition-colors"
                >
                  브라우저에서 열기
                </button>
              </div>
            </div>
          ) : (
            <webview
              ref={webviewRef as React.Ref<HTMLElement>}
              src={url}
              allowpopups=""
              partition="persist:tools"
              className="absolute inset-0 w-full h-full"
              style={{ visibility: isLoading ? 'hidden' : 'visible' }}
            />
          )}
        </div>
      </div>
    </ToolLayout>
  );
}

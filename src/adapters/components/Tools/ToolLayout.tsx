import { useCallback, useState } from 'react';

interface ToolLayoutProps {
  title: string;
  emoji: string;
  onBack: () => void;
  isFullscreen: boolean;
  children: React.ReactNode;
}

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

export function ToolLayout({ title, emoji, onBack, isFullscreen, children }: ToolLayoutProps) {
  const [zoom, setZoom] = useState(100);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {
        // Fullscreen not supported or denied
      });
    } else {
      document.exitFullscreen().catch(() => {
        // Already not in fullscreen
      });
    }
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
  }, []);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(100);
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between ${isFullscreen ? 'mb-2' : 'mb-6'}`}>
        <div className="flex items-center gap-4">
          {!isFullscreen && (
            <>
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sp-muted hover:text-white transition-colors text-sm"
              >
                <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                <span>쌤도구</span>
              </button>
              <div className="w-px h-5 bg-sp-border" />
            </>
          )}
          <h1 className={`font-bold text-white flex items-center gap-2 ${isFullscreen ? 'text-lg' : 'text-xl'}`}>
            <span>{emoji}</span>
            <span>{title}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <div className="flex items-center gap-0.5 bg-white/5 rounded-lg px-1 py-0.5">
            <button
              onClick={zoomOut}
              disabled={zoom <= ZOOM_MIN}
              className="p-1.5 rounded text-sp-muted hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
              title="축소"
            >
              <span className="material-symbols-outlined text-[18px]">remove</span>
            </button>
            <button
              onClick={resetZoom}
              className="px-2 py-1 text-xs font-medium text-sp-muted hover:text-white transition-colors min-w-[3.5rem] text-center rounded hover:bg-white/10"
              title="기본 배율로 초기화"
            >
              {zoom}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= ZOOM_MAX}
              className="p-1.5 rounded text-sp-muted hover:text-white hover:bg-white/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
              title="확대"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
            </button>
          </div>

          {/* Fullscreen button */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-sp-muted hover:text-white hover:bg-white/5 transition-all"
            title={isFullscreen ? '전체화면 나가기' : '전체화면'}
          >
            <span className="material-symbols-outlined">
              {isFullscreen ? 'fullscreen_exit' : 'fullscreen'}
            </span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top left',
            width: `${10000 / zoom}%`,
          }}
          className="flex flex-col min-h-full"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

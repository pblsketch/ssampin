import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { KeyboardShortcut } from './types';
import { useSoundStore } from '@adapters/stores/useSoundStore';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';
import { DualToolContext } from './DualToolContext';
import { ToolServicesContext } from './ToolServicesContext';

interface ToolLayoutProps {
  title: string;
  emoji: string;
  onBack: () => void;
  isFullscreen: boolean;
  children: React.ReactNode;
  shortcuts?: KeyboardShortcut[];
  disableZoom?: boolean;
}

const DUAL_MIN_WIDTH = 1280;

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 10;

function formatKeyLabel(key: string, modifiers?: { shift?: boolean; ctrl?: boolean }): string {
  const parts: string[] = [];
  if (modifiers?.ctrl) parts.push('Ctrl');
  if (modifiers?.shift) parts.push('Shift');
  if (key === ' ') parts.push('Space');
  else if (key === 'Escape') parts.push('Esc');
  else parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join('+');
}

function useCanEnterDual(): boolean {
  const [canEnter, setCanEnter] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.innerWidth >= DUAL_MIN_WIDTH;
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setCanEnter(window.innerWidth >= DUAL_MIN_WIDTH);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return canEnter;
}

export function ToolLayout({ title, emoji, onBack, isFullscreen, children, shortcuts, disableZoom }: ToolLayoutProps) {
  const [zoom, setZoom] = useState(100);
  const [showHelp, setShowHelp] = useState(false);
  const shortcutsRef = useRef<KeyboardShortcut[]>([]);
  shortcutsRef.current = shortcuts ?? [];

  const dualCtx = useContext(DualToolContext);
  const singleSvc = useContext(ToolServicesContext);
  const canEnterDual = useCanEnterDual();
  const showDualEntry = singleSvc !== null && dualCtx === null;

  const soundEnabled = useSoundStore((s) => s.settings.enabled);
  const soundLoaded = useSoundStore((s) => s.loaded);
  const loadSound = useSoundStore((s) => s.load);
  const toggleSound = useSoundStore((s) => s.toggleEnabled);

  useEffect(() => {
    if (!soundLoaded) loadSound();
  }, [soundLoaded, loadSound]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
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

  // Keyboard shortcut handler
  // 듀얼 모드: useToolKeydown 이 활성 슬롯이 아닐 때 자동으로 스킵.
  // 단일 모드: DualToolContext 부재 → 항상 실행 (기존 동작과 동일).
  useToolKeydown((e) => {
    // ESC: 듀얼 모드면 슬롯 닫기, 아니면 onBack
    if (e.key === 'Escape') {
      e.preventDefault();
      if (dualCtx) dualCtx.onSlotClose();
      else onBack();
      return;
    }

    // F11: 듀얼 모드면 슬롯 최대화 토글, 아니면 창 전체화면
    if (e.key === 'F11') {
      e.preventDefault();
      if (dualCtx) dualCtx.onSlotMaximizeToggle();
      else toggleFullscreen();
      return;
    }

    // Skip remaining shortcuts when focused on form elements
    const tag = (document.activeElement as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // M key for mute toggle
    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleSound();
      return;
    }

    for (const sc of shortcutsRef.current) {
      const keyMatch = e.key === sc.key;
      const needShift = sc.modifiers?.shift ?? false;
      const needCtrl = sc.modifiers?.ctrl ?? false;

      if (keyMatch && needShift === e.shiftKey && needCtrl === (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        sc.handler();
        return;
      }
    }
  }, [onBack, toggleFullscreen, toggleSound, dualCtx]);

  const allShortcuts = [
    { key: 'Esc', label: dualCtx ? '슬롯 닫기' : '뒤로가기' },
    { key: 'F11', label: dualCtx ? '슬롯 최대화' : '전체화면' },
    { key: 'M', label: '소리 켜기/끄기' },
    ...(shortcuts ?? []).map((s) => ({
      key: formatKeyLabel(s.key, s.modifiers),
      label: s.label,
    })),
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className={`flex items-center justify-between ${isFullscreen ? 'mb-2' : 'mb-6'}`}>
        <div className="flex items-center gap-4">
          {!isFullscreen && (
            <>
              <button
                onClick={onBack}
                className="flex items-center gap-1.5 text-sp-muted hover:text-sp-text transition-colors text-sm"
              >
                <span className="material-symbols-outlined text-icon-md">arrow_back</span>
                <span>쌤도구</span>
              </button>
              <div className="w-px h-5 bg-sp-border" />
            </>
          )}
          <h1 className={`font-bold text-sp-text flex items-center gap-2 ${isFullscreen ? 'text-lg' : 'text-xl'}`}>
            <span>{emoji}</span>
            <span>{title}</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          {!disableZoom && (
            <div className="flex items-center gap-0.5 bg-sp-text/5 rounded-lg px-1 py-0.5">
              <button
                onClick={zoomOut}
                disabled={zoom <= ZOOM_MIN}
                className="p-1.5 rounded text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
                title="축소"
              >
                <span className="material-symbols-outlined text-icon-md">remove</span>
              </button>
              <button
                onClick={resetZoom}
                className="px-2 py-1 text-xs font-medium text-sp-muted hover:text-sp-text transition-colors min-w-[3.5rem] text-center rounded hover:bg-sp-text/10"
                title="기본 배율로 초기화"
              >
                {zoom}%
              </button>
              <button
                onClick={zoomIn}
                disabled={zoom >= ZOOM_MAX}
                className="p-1.5 rounded text-sp-muted hover:text-sp-text hover:bg-sp-text/10 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
                title="확대"
              >
                <span className="material-symbols-outlined text-icon-md">add</span>
              </button>
            </div>
          )}

          {/* Sound toggle */}
          <button
            onClick={() => toggleSound()}
            className={`p-2 rounded-lg transition-all ${
              soundEnabled
                ? 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5'
                : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
            }`}
            title={soundEnabled ? '소리 끄기 (M)' : '소리 켜기 (M)'}
          >
            <span className="material-symbols-outlined text-icon-lg">
              {soundEnabled ? 'volume_up' : 'volume_off'}
            </span>
          </button>

          {/* Keyboard shortcuts help */}
          <div className="relative">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all"
              title="단축키 안내"
            >
              <span className="material-symbols-outlined text-icon-lg">keyboard</span>
            </button>
            {showHelp && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowHelp(false)} />
                <div className="absolute right-0 top-full mt-2 w-52 bg-sp-card border border-sp-border rounded-xl shadow-2xl z-50 p-3">
                  <h3 className="text-xs font-bold text-sp-text mb-2 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-icon-sm">keyboard</span>
                    단축키
                  </h3>
                  <div className="space-y-1">
                    {allShortcuts.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <kbd className="px-1.5 py-0.5 rounded bg-sp-text/10 text-sp-text font-mono text-caption">
                          {s.key}
                        </kbd>
                        <span className="text-sp-muted">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Dual mode entry button (single mode only) */}
          {showDualEntry && (
            <button
              type="button"
              onClick={singleSvc.onRequestDualMode}
              disabled={!canEnterDual}
              className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-sp-muted"
              title={
                canEnterDual
                  ? '병렬 모드로 열기'
                  : '화면이 좁아 병렬 모드를 지원하지 않습니다 (1280px 이상 권장)'
              }
              aria-label="병렬 모드로 열기"
            >
              <span className="material-symbols-outlined text-icon-lg">splitscreen</span>
            </button>
          )}

          {/* Dual mode slot controls (dual mode only) */}
          {dualCtx && (
            <>
              <button
                type="button"
                onClick={dualCtx.onRequestToolChange}
                className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all"
                title="도구 교체"
                aria-label="이 슬롯의 도구 교체"
              >
                <span className="material-symbols-outlined text-icon-lg">swap_horiz</span>
              </button>
              <button
                type="button"
                onClick={dualCtx.onSlotSwap}
                className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all"
                title="좌우 전환"
                aria-label="좌우 슬롯 도구 교환"
              >
                <span className="material-symbols-outlined text-icon-lg">swap_vert</span>
              </button>
            </>
          )}

          {/* Fullscreen / Slot maximize button */}
          <button
            type="button"
            onClick={dualCtx ? dualCtx.onSlotMaximizeToggle : toggleFullscreen}
            className="p-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-all"
            title={
              dualCtx
                ? '슬롯 최대화'
                : (isFullscreen ? '전체화면 나가기' : '전체화면')
            }
            aria-label={dualCtx ? '슬롯 최대화 토글' : (isFullscreen ? '전체화면 나가기' : '전체화면')}
          >
            <span className="material-symbols-outlined">
              {dualCtx
                ? 'open_in_full'
                : (isFullscreen ? 'fullscreen_exit' : 'fullscreen')}
            </span>
          </button>

          {/* Slot close button (dual mode only) */}
          {dualCtx && (
            <button
              type="button"
              onClick={dualCtx.onSlotClose}
              className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all"
              title="슬롯 닫기"
              aria-label="이 슬롯 닫기"
            >
              <span className="material-symbols-outlined text-icon-lg">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto">
        {disableZoom ? (
          <div className="flex flex-col min-h-full h-full">
            {children}
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}

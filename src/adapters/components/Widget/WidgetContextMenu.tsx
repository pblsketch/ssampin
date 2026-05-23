import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { WidgetDesktopMode, WidgetLayoutMode } from '@domain/entities/Settings';
import { isWindows } from '@adapters/hooks/shortcut/keyNormalize';

interface WidgetContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /**
   * widget-mode-discovery (v2.1.x~) — "모드 가이드 다시 보기" 클릭 시 호출.
   * 호출자(Widget.tsx)가 useFirstRunModeCoachTour.reset() 후 투어 모달을 노출.
   */
  onShowModeTour?: () => void;
}

export function WidgetContextMenu({ x, y, onClose, onShowModeTour }: WidgetContextMenuProps) {
  const { settings, update } = useSettingsStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const opacity = settings.widget.opacity;

  // 뷰포트 클램핑을 위한 위치 계산
  const [position, setPosition] = useState({ left: x, top: y });

  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      left: Math.min(x, vw - rect.width - 8),
      top: Math.min(y, vh - rect.height - 8),
    });
  }, [x, y]);

  // 외부 클릭으로 닫기
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleToggleWidget = () => {
    onClose();
    window.electronAPI?.toggleWidget();
  };

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const pct = Number(e.target.value);
    const normalized = pct / 100;
    void update({ widget: { ...settings.widget, opacity: normalized } });
    window.electronAPI?.setOpacity(normalized);
  };

  const handleSettings = () => {
    onClose();
    window.electronAPI?.toggleWidget();
  };

  const handleClose = () => {
    onClose();
    window.electronAPI?.closeWindow();
  };

  const menu = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-56 bg-sp-card/75 backdrop-blur-xl rounded-xl border border-sp-border/50 shadow-2xl overflow-hidden"
      style={{ left: position.left, top: position.top }}
    >
      {/* 메뉴 헤더 */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wider text-sp-muted font-semibold">SsamPin Menu</p>
      </div>

      {/* widget-mode-discovery — "모드" 섹션 최상단 승격 (3종 라디오 + 미리보기 썸네일) */}
      <div className="px-3 py-2" data-testid="context-menu-mode-section">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-sp-muted flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            tune
          </span>
          <span className="flex-1 text-sm text-sp-text font-medium">모드</span>
        </div>
        <div className="flex flex-col gap-0.5 pl-1">
          {[
            { value: 'normal' as const, label: '일반', preview: 'mode-preview/normal.svg' },
            { value: 'topmost' as const, label: '항상 위에', preview: 'mode-preview/topmost.svg' },
            {
              value: 'native-desktop' as const,
              label: '바탕화면 아이콘 아래',
              preview: 'mode-preview/native-desktop.svg',
              winOnly: true,
            },
          ].map((opt) => {
            const isSelected = settings.widget.desktopMode === opt.value;
            const disabled = opt.winOnly === true && !isWindows();
            return (
              <button
                key={opt.value}
                type="button"
                className={[
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-sm',
                  isSelected
                    ? 'bg-blue-500/15 text-blue-400'
                    : disabled
                      ? 'opacity-50 cursor-not-allowed text-sp-muted'
                      : 'hover:bg-sp-text/[0.06] text-sp-text',
                ].join(' ')}
                onClick={() => {
                  if (disabled || isSelected) return;
                  const nextMode: WidgetDesktopMode = opt.value;
                  void update({ widget: { ...settings.widget, desktopMode: nextMode } });
                  void window.electronAPI?.applyWidgetSettings({
                    opacity: settings.widget.opacity,
                    desktopMode: nextMode,
                  });
                }}
                disabled={disabled}
                title={disabled ? 'Windows에서만 사용할 수 있는 기능입니다' : undefined}
                data-testid={`context-menu-mode-${opt.value}`}
              >
                <span
                  className={[
                    'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                    isSelected ? 'border-blue-400' : 'border-sp-border',
                  ].join(' ')}
                >
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </span>
                <img
                  src={opt.preview}
                  alt=""
                  width={24}
                  height={16}
                  className="flex-shrink-0 rounded opacity-70"
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.winOnly && (
                  <span className="px-1 rounded bg-sp-accent/15 text-sp-accent text-[9px] font-bold flex-shrink-0">
                    Win
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {/* 모드 가이드 다시 보기 */}
        {onShowModeTour && (
          <button
            type="button"
            className="mt-1 w-full text-left px-2 py-1 rounded-lg text-xs text-sp-muted hover:text-sp-text hover:bg-sp-text/[0.06]"
            onClick={() => {
              onShowModeTour();
              onClose();
            }}
            data-testid="context-menu-mode-tour-reset"
          >
            <span className="material-symbols-outlined align-middle mr-1" style={{ fontSize: 14 }}>
              help
            </span>
            모드 가이드 다시 보기
          </button>
        )}
      </div>

      {/* 구분선 */}
      <div className="h-px bg-sp-border mx-3 my-1" />

      {/* 레이아웃 선택 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-sp-muted flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            grid_view
          </span>
          <span className="flex-1 text-sm text-sp-text">레이아웃</span>
        </div>
        <div className="flex flex-col gap-0.5 pl-1">
          {[
            { mode: 'full' as WidgetLayoutMode, label: '전체화면', shortcut: 'Ctrl+1' },
            { mode: 'split-h' as WidgetLayoutMode, label: '좌우 분할', shortcut: 'Ctrl+2' },
            { mode: 'split-v' as WidgetLayoutMode, label: '상하 분할', shortcut: 'Ctrl+3' },
            { mode: 'quad' as WidgetLayoutMode, label: '4분할', shortcut: 'Ctrl+4' },
            { mode: 'sidebar-right' as WidgetLayoutMode, label: '우측 사이드', shortcut: 'Ctrl+5' },
          ].map((opt) => {
            const isActive = (settings.widget.layoutMode ?? 'full') === opt.mode;
            return (
              <button
                key={opt.mode}
                className={[
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-sm',
                  isActive
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'hover:bg-sp-text/[0.06] text-sp-text',
                ].join(' ')}
                onClick={() => {
                  void update({ widget: { ...settings.widget, layoutMode: opt.mode } });
                  window.electronAPI?.setWidgetLayout(opt.mode);
                }}
              >
                <span
                  className={[
                    'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                    isActive ? 'border-blue-400' : 'border-sp-border',
                  ].join(' ')}
                >
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </span>
                <span className="flex-1">{opt.label}</span>
                <span className="text-xs text-sp-muted">{opt.shortcut}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-sp-border mx-3 my-1" />

      {/* 날씨 표시 토글 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sp-text/[0.08] transition-colors text-left"
        onClick={() => {
          void update({
            widget: { ...settings.widget, showWeather: !(settings.widget.showWeather !== false) },
          });
          onClose();
        }}
      >
        <span
          className="material-symbols-outlined text-sp-muted flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          {settings.widget.showWeather !== false ? 'cloud_off' : 'cloud'}
        </span>
        <span className="text-sm text-sp-text">
          날씨 {settings.widget.showWeather !== false ? '숨기기' : '표시'}
        </span>
      </button>

      {/* 구분선 */}
      <div className="h-px bg-sp-border mx-3 my-1" />

      {/* 전체 화면으로 전환 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sp-text/[0.08] transition-colors text-left"
        onClick={handleToggleWidget}
      >
        <span
          className="material-symbols-outlined text-sp-muted flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          fullscreen
        </span>
        <span className="text-sm text-sp-text">전체 화면으로 전환</span>
      </button>

      {/* 아이콘 모드로 접기 (v2.0.2~) */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sp-text/[0.08] transition-colors text-left"
        onClick={() => {
          onClose();
          void window.electronAPI?.iconShow();
        }}
      >
        <span
          className="material-symbols-outlined text-sp-muted flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          push_pin
        </span>
        <span className="text-sm text-sp-text">아이콘으로 접기</span>
      </button>

      {/* 구분선 */}
      <div className="h-px bg-sp-border mx-3 my-1" />

      {/* 투명도 조절 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-sp-muted flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            opacity
          </span>
          <span className="flex-1 text-sm text-sp-text">투명도 조절</span>
          <span className="text-xs font-mono text-sp-muted flex-shrink-0 w-8 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <div className="px-1">
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            onChange={handleOpacityChange}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, #3b82f6 ${Math.round(opacity * 100)}%, #334155 ${Math.round(opacity * 100)}%)`,
            }}
          />
        </div>
      </div>

      {/* 폰트 크기 조절 (위젯 전용) */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-sp-muted flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            format_size
          </span>
          <span className="flex-1 text-sm text-sp-text">글자 크기</span>
          <span className="text-xs font-mono text-sp-muted flex-shrink-0 w-12 text-right">
            {settings.fontSize === 'small'
              ? '작게'
              : settings.fontSize === 'large'
                ? '크게'
                : settings.fontSize === 'xlarge'
                  ? '매우 크게'
                  : '보통'}
          </span>
        </div>
        <div className="px-1 flex items-center justify-between gap-2">
          {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
            <button
              key={size}
              onClick={() => void update({ fontSize: size })}
              className={`w-full py-1 rounded text-xs transition-colors ${
                settings.fontSize === size
                  ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                  : 'bg-sp-surface/50 text-sp-muted hover:bg-sp-surface hover:text-sp-text'
              }`}
            >
              {size === 'small' ? '가' : size === 'medium' ? '가' : size === 'large' ? '가' : '가'}
            </button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-sp-border mx-3 my-1" />

      {/* 설정 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-sp-text/[0.08] transition-colors text-left"
        onClick={handleSettings}
      >
        <span
          className="material-symbols-outlined text-sp-muted flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          settings
        </span>
        <span className="text-sm text-sp-text">설정</span>
      </button>

      {/* 닫기 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-500/10 transition-colors text-left group mb-1"
        onClick={handleClose}
      >
        <span
          className="material-symbols-outlined text-sp-muted group-hover:text-red-400 flex-shrink-0 transition-colors"
          style={{ fontSize: 20 }}
        >
          close
        </span>
        <span className="text-sm text-sp-text group-hover:text-red-300 transition-colors">
          닫기
        </span>
      </button>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}

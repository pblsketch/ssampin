import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { WidgetLayoutMode } from '@domain/entities/Settings';

interface WidgetContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function WidgetContextMenu({ x, y, onClose }: WidgetContextMenuProps) {
  const { settings, update } = useSettingsStore();
  const menuRef = useRef<HTMLDivElement>(null);

  const alwaysOnTop = settings.widget.alwaysOnTop;
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

  const handleAlwaysOnTop = () => {
    const next = !alwaysOnTop;
    void update({ widget: { ...settings.widget, alwaysOnTop: next } });
    window.electronAPI?.setAlwaysOnTop(next);
  };

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
      className="fixed z-[9999] w-56 bg-slate-800/75 backdrop-blur-xl rounded-xl border border-white/10 shadow-2xl overflow-hidden"
      style={{ left: position.left, top: position.top }}
    >
      {/* 메뉴 헤더 */}
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
          SsamPin Menu
        </p>
      </div>

      {/* 항상 위에 표시 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleAlwaysOnTop}
      >
        <span
          className={[
            'material-symbols-outlined flex-shrink-0',
            alwaysOnTop ? 'text-blue-400' : 'text-slate-400',
          ].join(' ')}
          style={{ fontSize: 20 }}
        >
          push_pin
        </span>
        <span className="flex-1 text-sm text-slate-200">항상 위에 표시</span>
        {alwaysOnTop && (
          <span
            className="material-symbols-outlined text-blue-400 flex-shrink-0"
            style={{ fontSize: 16 }}
          >
            check
          </span>
        )}
      </button>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 레이아웃 선택 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            grid_view
          </span>
          <span className="flex-1 text-sm text-slate-200">레이아웃</span>
        </div>
        <div className="flex flex-col gap-0.5 pl-1">
          {([
            { mode: 'full' as WidgetLayoutMode, label: '전체화면', shortcut: 'Ctrl+1' },
            { mode: 'split-h' as WidgetLayoutMode, label: '좌우 분할', shortcut: 'Ctrl+2' },
            { mode: 'split-v' as WidgetLayoutMode, label: '상하 분할', shortcut: 'Ctrl+3' },
            { mode: 'quad' as WidgetLayoutMode, label: '4분할', shortcut: 'Ctrl+4' },
          ]).map((opt) => {
            const isActive = (settings.widget.layoutMode ?? 'full') === opt.mode;
            return (
              <button
                key={opt.mode}
                className={[
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-sm',
                  isActive
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'hover:bg-white/[0.06] text-slate-300',
                ].join(' ')}
                onClick={() => {
                  void update({ widget: { ...settings.widget, layoutMode: opt.mode } });
                  window.electronAPI?.setWidgetLayout(opt.mode);
                }}
              >
                <span className={[
                  'w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center',
                  isActive ? 'border-blue-400' : 'border-slate-500',
                ].join(' ')}>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />}
                </span>
                <span className="flex-1">{opt.label}</span>
                <span className="text-xs text-slate-500">{opt.shortcut}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 전체 화면으로 전환 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleToggleWidget}
      >
        <span
          className="material-symbols-outlined text-slate-400 flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          fullscreen
        </span>
        <span className="text-sm text-slate-200">전체 화면으로 전환</span>
      </button>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 투명도 조절 */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-3 mb-2">
          <span
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            opacity
          </span>
          <span className="flex-1 text-sm text-slate-200">투명도 조절</span>
          <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-8 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
        <div className="px-1">
          <input
            type="range"
            min={20}
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
            className="material-symbols-outlined text-slate-400 flex-shrink-0"
            style={{ fontSize: 20 }}
          >
            format_size
          </span>
          <span className="flex-1 text-sm text-slate-200">글자 크기</span>
          <span className="text-xs font-mono text-slate-400 flex-shrink-0 w-12 text-right">
            {settings.fontSize === 'small' ? '작게' : settings.fontSize === 'large' ? '크게' : settings.fontSize === 'xlarge' ? '매우 크게' : '보통'}
          </span>
        </div>
        <div className="px-1 flex items-center justify-between gap-2">
          {(['small', 'medium', 'large', 'xlarge'] as const).map((size) => (
            <button
              key={size}
              onClick={() => void update({ fontSize: size })}
              className={`w-full py-1 rounded text-xs transition-colors ${settings.fontSize === size
                  ? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/50'
                  : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200'
                }`}
            >
              {size === 'small' ? '가' : size === 'medium' ? '가' : size === 'large' ? '가' : '가'}
            </button>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className="h-px bg-white/10 mx-3 my-1" />

      {/* 설정 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] transition-colors text-left"
        onClick={handleSettings}
      >
        <span
          className="material-symbols-outlined text-slate-400 flex-shrink-0"
          style={{ fontSize: 20 }}
        >
          settings
        </span>
        <span className="text-sm text-slate-200">설정</span>
      </button>

      {/* 닫기 */}
      <button
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-500/10 transition-colors text-left group mb-1"
        onClick={handleClose}
      >
        <span
          className="material-symbols-outlined text-slate-400 group-hover:text-red-400 flex-shrink-0 transition-colors"
          style={{ fontSize: 20 }}
        >
          close
        </span>
        <span className="text-sm text-slate-200 group-hover:text-red-300 transition-colors">
          닫기
        </span>
      </button>
    </div>
  );

  return ReactDOM.createPortal(menu, document.body);
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  GRID_MODE_ORDER,
  GRID_LABELS,
  GRID_DESCRIPTIONS,
  BACKGROUND_RENDER_KIND,
  BACKGROUND_THUMBS,
} from './types';
import type { GridMode } from './types';

interface BoardBackgroundPickerProps {
  gridMode: GridMode;
  onGridModeChange: (mode: GridMode) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const POPOVER_WIDTH = 300;
const POPOVER_HEIGHT = 280;

export function BoardBackgroundPicker({
  gridMode,
  onGridModeChange,
  open,
  onOpenChange,
}: BoardBackgroundPickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverStyle, setPopoverStyle] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [hoverMode, setHoverMode] = useState<GridMode | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      let left = rect.left + rect.width / 2 - POPOVER_WIDTH / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - POPOVER_WIDTH - 8));
      const top = rect.top - POPOVER_HEIGHT - 8;
      setPopoverStyle({ left, top: Math.max(8, top) });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      onOpenChange(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('mousedown', handle);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', handle);
      window.removeEventListener('keydown', esc);
    };
  }, [open, onOpenChange]);

  const handleTriggerClick = () => onOpenChange(!open);
  const handleSelect = (mode: GridMode) => {
    onGridModeChange(mode);
    onOpenChange(false);
  };

  const isActive = gridMode !== 'none';
  const currentLabel = GRID_LABELS[gridMode];
  const showMapHint =
    BACKGROUND_RENDER_KIND[gridMode] === 'cssImage' ||
    (hoverMode !== null && BACKGROUND_RENDER_KIND[hoverMode] === 'cssImage');

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleTriggerClick}
        title="배경 전환 (G)"
        className={`rounded-xl px-3 py-2 text-sm font-medium transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
          isActive
            ? 'ring-2 ring-amber-400 bg-amber-100 text-amber-900'
            : 'bg-white hover:bg-gray-50 text-gray-700'
        }`}
      >
        <span className="material-symbols-outlined text-icon-md">grid_on</span>
        {currentLabel}
        <span className="material-symbols-outlined text-icon-sm opacity-60">expand_more</span>
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', left: popoverStyle.left, top: popoverStyle.top, width: POPOVER_WIDTH, zIndex: 10000 }}
          className="bg-white rounded-xl shadow-xl border border-gray-200 p-3"
        >
          <div className="text-xs font-semibold text-gray-600 mb-2">배경</div>
          <div className="grid grid-cols-3 gap-1.5">
            {GRID_MODE_ORDER.map((mode) => (
              <BackgroundOption
                key={mode}
                mode={mode}
                active={gridMode === mode}
                onSelect={() => handleSelect(mode)}
                onMouseEnter={() => setHoverMode(mode)}
                onMouseLeave={() => setHoverMode((m) => (m === mode ? null : m))}
              />
            ))}
          </div>
          {showMapHint && (
            <div className="mt-2 pt-2 border-t border-gray-100 text-detail text-gray-500">
              💡 어두운 칠판색에서 가장 선명해요
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

interface BackgroundOptionProps {
  mode: GridMode;
  active: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function BackgroundOption({ mode, active, onSelect, onMouseEnter, onMouseLeave }: BackgroundOptionProps) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`rounded-lg p-2 flex flex-col items-center gap-1 transition-colors ${
        active
          ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-400'
          : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
      }`}
    >
      <div className="w-full h-12 rounded bg-[#2d5a27] border border-gray-300 flex items-center justify-center overflow-hidden">
        <BackgroundThumb mode={mode} />
      </div>
      <span className="text-detail font-medium">{GRID_LABELS[mode]}</span>
      <span className="text-[9px] text-gray-500">{GRID_DESCRIPTIONS[mode]}</span>
    </button>
  );
}

function BackgroundThumb({ mode }: { mode: GridMode }) {
  const thumbUrl = BACKGROUND_THUMBS[mode];
  if (thumbUrl) {
    return (
      <img
        src={thumbUrl}
        alt=""
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    );
  }
  // Inline SVG 미니 프리뷰 (canvas 경로)
  if (mode === 'none') {
    return <span className="text-caption text-white/40">없음</span>;
  }
  const stroke = 'rgba(255,255,255,0.6)';
  if (mode === 'grid') {
    return (
      <svg viewBox="0 0 40 24" className="w-full h-full">
        <g stroke={stroke} strokeWidth="0.5">
          {[6, 12, 18, 24, 30].map((x) => <line key={'v' + x} x1={x} y1="0" x2={x} y2="24" />)}
          {[6, 12, 18].map((y) => <line key={'h' + y} x1="0" y1={y} x2="40" y2={y} />)}
        </g>
      </svg>
    );
  }
  if (mode === 'lines') {
    return (
      <svg viewBox="0 0 40 24" className="w-full h-full">
        <g stroke={stroke} strokeWidth="0.7">
          {[6, 12, 18].map((y) => <line key={y} x1="2" y1={y} x2="38" y2={y} />)}
        </g>
      </svg>
    );
  }
  if (mode === 'staff') {
    return (
      <svg viewBox="0 0 40 24" className="w-full h-full">
        <g stroke={stroke} strokeWidth="0.5">
          {[6, 9, 12, 15, 18].map((y) => <line key={y} x1="2" y1={y} x2="38" y2={y} />)}
        </g>
      </svg>
    );
  }
  return null;
}

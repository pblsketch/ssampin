import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import type { WidgetLayoutMode } from '@domain/entities/Settings';

interface LayoutSelectorProps {
  anchorRect: DOMRect;
  currentMode: WidgetLayoutMode;
  onSelect: (mode: WidgetLayoutMode) => void;
  onClose: () => void;
}

interface LayoutOption {
  mode: WidgetLayoutMode;
  label: string;
  icon: string; // SVG path
  shortcut: string;
}

const LAYOUT_OPTIONS: LayoutOption[] = [
  {
    mode: 'full',
    label: '전체화면',
    icon: 'M3 3h18v18H3z',
    shortcut: 'Ctrl+1',
  },
  {
    mode: 'split-h',
    label: '좌우 분할',
    icon: 'M3 3h8v18H3zM13 3h8v18h-8z',
    shortcut: 'Ctrl+2',
  },
  {
    mode: 'split-v',
    label: '상하 분할',
    icon: 'M3 3h18v8H3zM3 13h18v8H3z',
    shortcut: 'Ctrl+3',
  },
  {
    mode: 'quad',
    label: '4분할',
    icon: 'M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z',
    shortcut: 'Ctrl+4',
  },
];

/**
 * 레이아웃 선택 플로팅 팝업.
 * 앵커 버튼 아래에 표시되며, 외부 클릭/ESC로 닫힌다.
 * ReactDOM.createPortal로 렌더링 (WorkerW 호환).
 */
export function LayoutSelector({ anchorRect, currentMode, onSelect, onClose }: LayoutSelectorProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  // 팝업 위치 계산 (앵커 아래)
  useEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchorRect.left;
    let top = anchorRect.bottom + 4;

    // 화면 밖으로 나가면 보정
    if (left + rect.width > vw - 8) left = vw - rect.width - 8;
    if (top + rect.height > vh - 8) top = anchorRect.top - rect.height - 4;
    if (left < 8) left = 8;

    setPosition({ left, top });
  }, [anchorRect]);

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

  const popup = (
    <div
      ref={menuRef}
      className="fixed z-[9999] w-44 bg-sp-card/75 backdrop-blur-xl rounded-xl border border-sp-border shadow-2xl overflow-hidden"
      style={{ left: position.left, top: position.top }}
    >
      <div className="px-3 pt-3 pb-2">
        <p className="text-xs uppercase tracking-wider text-sp-muted font-semibold">
          레이아웃 선택
        </p>
      </div>

      {LAYOUT_OPTIONS.map((opt) => {
        const isActive = currentMode === opt.mode;
        return (
          <button
            key={opt.mode}
            className={[
              'w-full flex items-center gap-3 px-3 py-2 transition-colors text-left',
              isActive
                ? 'bg-sp-accent/15 text-sp-accent'
                : 'hover:bg-sp-text/[0.08] text-sp-text',
            ].join(' ')}
            onClick={() => {
              onSelect(opt.mode);
              onClose();
            }}
          >
            {/* 레이아웃 미니 아이콘 */}
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="flex-shrink-0"
            >
              <path
                d={opt.icon}
                stroke={isActive ? 'var(--sp-accent)' : 'var(--sp-muted)'}
                strokeWidth="1.5"
                fill="none"
                rx="1"
              />
            </svg>
            <span className="flex-1 text-sm">{opt.label}</span>
            <span className={[
              'text-[11px] ml-auto',
              isActive ? 'text-sp-accent/60' : 'text-sp-muted/50',
            ].join(' ')}>
              {opt.shortcut}
            </span>
            {isActive && (
              <span
                className="material-symbols-outlined text-sp-accent flex-shrink-0"
                style={{ fontSize: 16 }}
              >
                check
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return ReactDOM.createPortal(popup, document.body);
}

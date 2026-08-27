/**
 * CategoryColorPicker — 일정 카테고리 색상 점 + 드롭다운 팔레트.
 *
 * 일정 > 카테고리 관리 모달과 설정 > 캘린더 탭이 공유한다.
 * 팝업은 Portal(document.body)로 렌더되어 모달/스크롤 컨테이너에 잘리지 않는다 —
 * 모달 안에서 동작하려면 공용 Modal의 FocusTrap allowOutsideClick 허용이 전제다.
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_COLOR_PRESETS } from '@domain/entities/SchoolEvent';

export const CATEGORY_COLOR_INFO: Record<
  string,
  { bg: string; shadow: string; ring: string; label: string }
> = {
  blue: {
    bg: 'bg-blue-500',
    shadow: 'shadow-[0_0_8px_rgba(59,130,246,0.5)]',
    ring: 'ring-blue-500',
    label: '파랑',
  },
  green: {
    bg: 'bg-green-500',
    shadow: 'shadow-[0_0_8px_rgba(34,197,94,0.5)]',
    ring: 'ring-green-500',
    label: '초록',
  },
  yellow: {
    bg: 'bg-amber-500',
    shadow: 'shadow-[0_0_8px_rgba(245,158,11,0.5)]',
    ring: 'ring-amber-500',
    label: '노랑',
  },
  purple: {
    bg: 'bg-purple-500',
    shadow: 'shadow-[0_0_8px_rgba(168,85,247,0.5)]',
    ring: 'ring-purple-500',
    label: '보라',
  },
  red: {
    bg: 'bg-red-500',
    shadow: 'shadow-[0_0_8px_rgba(239,68,68,0.5)]',
    ring: 'ring-red-500',
    label: '빨강',
  },
  pink: {
    bg: 'bg-pink-500',
    shadow: 'shadow-[0_0_8px_rgba(236,72,153,0.5)]',
    ring: 'ring-pink-500',
    label: '분홍',
  },
  indigo: {
    bg: 'bg-indigo-500',
    shadow: 'shadow-[0_0_8px_rgba(99,102,241,0.5)]',
    ring: 'ring-indigo-500',
    label: '남색',
  },
  teal: {
    bg: 'bg-teal-500',
    shadow: 'shadow-[0_0_8px_rgba(20,184,166,0.5)]',
    ring: 'ring-teal-500',
    label: '청록',
  },
  gray: {
    bg: 'bg-slate-400',
    shadow: 'shadow-[0_0_8px_rgba(148,163,184,0.5)]',
    ring: 'ring-slate-400',
    label: '회색',
  },
};

/** 선택 가능한 색 키 목록 (프리셋 8색 + 회색) */
export const CATEGORY_COLOR_KEYS = [...CATEGORY_COLOR_PRESETS, 'gray' as const];

export function categoryColorDot(color: string, size = 'w-3 h-3') {
  const fallback = CATEGORY_COLOR_INFO['gray']!;
  const c = CATEGORY_COLOR_INFO[color] ?? fallback;
  return `${size} rounded-full ${c.bg} ${c.shadow}`;
}

export function CategoryColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        btnRef.current?.contains(e.target as Node) ||
        popupRef.current?.contains(e.target as Node)
      )
        return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleToggle() {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      // 팝업을 버튼 아래 왼쪽 정렬로 배치
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(!open);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-sp-surface transition-colors shrink-0"
        title="색상 변경"
      >
        <div className={categoryColorDot(value, 'w-4 h-4')} />
        <span className="material-symbols-outlined text-icon-sm text-sp-muted">expand_more</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={popupRef}
            data-sp-floating
            className="fixed z-sp-tooltip bg-sp-card border border-sp-border rounded-xl shadow-2xl p-3"
            style={{ top: pos.top, left: pos.left, minWidth: 200 }}
          >
            <div className="grid grid-cols-3 gap-2">
              {CATEGORY_COLOR_KEYS.map((c) => {
                const info = CATEGORY_COLOR_INFO[c];
                if (!info) return null;
                const isSelected = c === value;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-sp-accent/10 ring-1 ring-sp-accent/40 text-sp-text font-semibold'
                        : 'hover:bg-sp-surface text-sp-muted'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded-full ${info.bg}`} />
                    {info.label}
                  </button>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

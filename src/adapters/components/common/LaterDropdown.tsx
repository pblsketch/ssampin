import { useState, useRef, useEffect, useCallback } from 'react';

interface LaterDropdownProps {
  /** 보안 업데이트면 "이 버전 건너뛰기" 메뉴 항목 숨김 */
  isSecurity: boolean;
  onSnooze1d: () => void;
  onSnooze3d: () => void;
  onSkip: () => void;
}

/**
 * 업데이트 모달의 "[나중에 ▾]" 드롭다운.
 *
 * - 1일/3일 스누즈 + 영구 건너뛰기 (보안 시 건너뛰기 숨김)
 * - role="menu" + 키보드 화살표 네비 + ESC stopPropagation (모달은 안 닫힘)
 */
export function LaterDropdown({ isSecurity, onSnooze1d, onSnooze3d, onSkip }: LaterDropdownProps) {
  const [open, setOpen] = useState(false);
  const focusIndexRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const items = isSecurity
    ? [
        { label: '1일 뒤 다시 알림', handler: onSnooze1d },
        { label: '3일 뒤 다시 알림', handler: onSnooze3d },
      ]
    : [
        { label: '1일 뒤 다시 알림', handler: onSnooze1d },
        { label: '3일 뒤 다시 알림', handler: onSnooze3d },
        { label: '이 버전 건너뛰기', handler: onSkip, isDestructive: true },
      ];

  const close = useCallback(() => {
    setOpen(false);
    focusIndexRef.current = 0;
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusIndexRef.current + 1) % items.length;
        focusIndexRef.current = next;
        itemRefs.current[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (focusIndexRef.current - 1 + items.length) % items.length;
        focusIndexRef.current = next;
        itemRefs.current[next]?.focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };

    document.addEventListener('keydown', handleKey, { capture: true });
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKey, { capture: true });
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, items.length, close]);

  useEffect(() => {
    if (open) {
      itemRefs.current[0]?.focus();
    }
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="px-3 py-1.5 text-sm text-sp-muted hover:text-sp-text transition-colors rounded-lg hover:bg-sp-surface flex items-center gap-1"
      >
        나중에
        <span
          className={[
            'material-symbols-outlined text-base transition-transform duration-200',
            open ? 'rotate-180' : 'rotate-0',
          ].join(' ')}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="나중에 다시 알림"
          className="absolute bottom-full right-0 mb-1 bg-sp-card border border-sp-border rounded-lg shadow-lg py-1 min-w-[180px] z-10"
        >
          {items.map((item, idx) => (
            <div key={item.label}>
              {item.isDestructive && (
                <div role="separator" className="my-1 border-t border-sp-border/40" />
              )}
              <button
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                role="menuitem"
                type="button"
                onClick={() => {
                  item.handler();
                  close();
                }}
                className={[
                  'w-full text-left px-3 py-2 text-sm transition-colors',
                  item.isDestructive
                    ? 'text-sp-muted hover:text-red-400 hover:bg-red-500/10'
                    : 'text-sp-text hover:bg-sp-surface',
                ].join(' ')}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

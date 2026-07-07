import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * 시간표 "불러오기" 소스 한 항목 (나이스 / 컴시간 / 압핀 등).
 * 호출부(TimetablePage)가 현재 탭에서 쓸 수 있는 항목만 골라 배열로 넘긴다.
 */
export interface ImportSource {
  /** React key + 내부 포커스 추적용 고유 키 */
  key: string;
  /** 메뉴에 표시할 라벨. 예: "나이스에서 불러오기" */
  label: string;
  /** Material Symbols 아이콘 이름. 생략 시 'download' */
  icon?: string;
  /** 라벨 아래 보여줄 부가 설명 (선택) */
  hint?: string;
  /** 항목 선택 시 실행 — 실행 후 메뉴는 자동으로 닫힌다 */
  onSelect: () => void;
}

export interface ImportSourceMenuProps {
  /** 현재 탭에서 노출할 소스 목록. 0개면 아무것도 렌더하지 않는다. */
  sources: readonly ImportSource[];
}

const TRIGGER_CLASSES =
  'flex items-center gap-2 rounded-xl border border-sp-border bg-black/5 dark:bg-white/10 px-4 py-2.5 text-sm font-bold text-sp-accent transition-all hover:bg-black/10 dark:hover:bg-white/15 active:scale-95';

/**
 * 시간표 헤더의 단일 "불러오기" 드롭다운.
 *
 * 나이스·컴시간·압핀처럼 탭마다 달라지는 불러오기 소스를 버튼 하나로 통합한다.
 * - 소스가 2개 이상이면 드롭다운 메뉴(role="menu")로 선택.
 * - 소스가 1개면 드롭다운 없이 그 항목을 바로 실행하는 단일 버튼으로 동작.
 * - 소스가 0개면 렌더하지 않는다.
 *
 * 접근성: 바깥 클릭/Esc로 닫힘, 방향키로 항목 이동, 선택·Esc 시 트리거로 포커스 복귀.
 *
 * 메뉴는 `document.body`로 **포털**해 `position:fixed`로 띄운다 — 부모(시간표 페이지 루트)의
 * `overflow-hidden`에 잘리지 않게 하기 위함이다. 위치는 트리거 버튼 기준으로 계산한다.
 *
 * ⚠️ sp-* 토큰은 Tailwind 투명도 수식(`bg-sp-accent/10` 등)이 무효라 조용히 투명 렌더된다
 * (memory/feedback_sp_token_alpha_modifier_broken.md). 이 컴포넌트는 그 대신
 * `bg-black/5 dark:bg-white/10` + solid `text-sp-accent` 조합으로 동일한 "옅은 강조" 인상을 낸다.
 */
export function ImportSourceMenu({ sources }: ImportSourceMenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const focusIndexRef = useRef(0);
  const menuId = useId();

  const close = useCallback((refocusTrigger: boolean) => {
    setOpen(false);
    focusIndexRef.current = 0;
    if (refocusTrigger) {
      triggerRef.current?.focus();
    }
  }, []);

  const handleSelect = useCallback(
    (source: ImportSource) => {
      source.onSelect();
      close(true);
    },
    [close],
  );

  // 트리거 위치 기준으로 메뉴 위치 계산 (우측 정렬, 트리거 아래 8px)
  const reposition = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // 바깥 클릭 + 방향키/Esc + 스크롤/리사이즈 (메뉴가 열려 있을 때만 등록)
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close(true);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = (focusIndexRef.current + 1) % sources.length;
        focusIndexRef.current = next;
        itemRefs.current[next]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const next = (focusIndexRef.current - 1 + sources.length) % sources.length;
        focusIndexRef.current = next;
        itemRefs.current[next]?.focus();
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        close(false);
      }
    };

    // 스크롤 중에는 위치가 어긋나므로 닫는다
    const handleScroll = () => close(false);

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('scroll', handleScroll, { capture: true });
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      window.removeEventListener('resize', reposition);
    };
  }, [open, sources.length, close, reposition]);

  // 메뉴가 열리면 첫 항목으로 포커스 이동
  useEffect(() => {
    if (open && pos) {
      itemRefs.current[0]?.focus();
    }
  }, [open, pos]);

  if (sources.length === 0) {
    return null;
  }

  // 소스가 하나뿐이면 드롭다운 없이 바로 실행하는 단일 버튼으로 동작
  const only = sources.length === 1 ? sources[0] : undefined;
  if (only) {
    return (
      <button
        type="button"
        onClick={() => only.onSelect()}
        aria-label={`시간표 불러오기 — ${only.label}`}
        className={TRIGGER_CLASSES}
      >
        <span className="material-symbols-outlined text-icon-lg">{only.icon ?? 'download'}</span>
        <span className="hidden xl:inline">불러오기</span>
      </button>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label="시간표 불러오기"
        className={TRIGGER_CLASSES}
      >
        <span className="material-symbols-outlined text-icon-lg">download</span>
        <span className="hidden xl:inline">불러오기</span>
        <span
          className={`material-symbols-outlined text-icon-md transition-transform duration-sp-base ${
            open ? 'rotate-180' : 'rotate-0'
          }`}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label="시간표 불러오기 — 원본 선택"
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 60 }}
            className="w-72 overflow-hidden rounded-xl border border-sp-border bg-sp-card shadow-2xl shadow-black/30"
          >
            <div className="divide-y divide-sp-border">
              {sources.map((source, idx) => (
                <button
                  key={source.key}
                  ref={(el) => {
                    itemRefs.current[idx] = el;
                  }}
                  type="button"
                  role="menuitem"
                  onClick={() => handleSelect(source)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm text-sp-text transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span className="material-symbols-outlined mt-0.5 text-icon-md text-sp-muted">
                    {source.icon ?? 'download'}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-bold">{source.label}</span>
                    {source.hint && <span className="text-xs text-sp-muted">{source.hint}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

import { useState } from 'react';

export interface QuickAddAction {
  key: string;
  label: string;
  icon: string;
  /** 아이콘 배경/색 Tailwind 클래스 (예: 'bg-sp-accent/15 text-sp-accent'). */
  tone?: string;
  onSelect: () => void;
}

interface QuickAddFabProps {
  actions: readonly QuickAddAction[];
}

/**
 * 전역 빠른 추가 FAB — 탭하면 바텀시트로 액션 목록(현재 탭에 따라 달라짐).
 * actions 가 비어 있으면 아무것도 렌더하지 않는다 (예: '더보기' 탭).
 */
export function QuickAddFab({ actions }: QuickAddFabProps) {
  const [open, setOpen] = useState(false);

  if (actions.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="빠른 추가"
        aria-haspopup="dialog"
        className="fixed right-4 bottom-[calc(var(--tab-bar-height)+1rem)] z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sp-accent text-sp-accent-fg shadow-lg transition-transform active:scale-95"
      >
        <span className="material-symbols-outlined text-2xl">add</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full glass-card rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="빠른 추가"
          >
            <div className="mx-auto mb-3 mt-3 h-1 w-10 rounded-full bg-sp-border" />
            <p className="px-5 pb-1 text-xs font-semibold uppercase tracking-wider text-sp-muted">
              추가하기
            </p>
            <div className="px-2 pb-2">
              {actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    a.onSelect();
                  }}
                  className="flex min-h-[56px] w-full items-center gap-4 rounded-xl px-3 py-3 text-left transition-colors active:bg-sp-accent/8"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${a.tone ?? 'bg-sp-accent/15 text-sp-accent'}`}
                  >
                    <span className="material-symbols-outlined">{a.icon}</span>
                  </span>
                  <span className="text-sm font-medium text-sp-text">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

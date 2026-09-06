/**
 * 근거 정리 보드의 **오른쪽 서랍** — 주제 줄기·가져오기 후보가 같은 껍데기를 쓴다.
 *
 * body 에 붙인다(`createPortal`): 보드는 유리(backdrop-filter) 패널 안에 있어서 그 안에 띄우면 배경이
 * 지워진다(index.css ①-예외). `role="dialog"` + `bg-sp-card` + `data-sp-floating` 으로 유리 모드에서도 불투명하다.
 * Esc·바깥 클릭으로 닫히고, 닫히면 **열었던 단추로 포커스를 되돌린다**(키보드 사용자가 자리를 잃지 않게).
 */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface EvidenceDrawerProps {
  /** 서랍 제목 — `aria-labelledby` 로 대화상자와 연결된다. */
  readonly title: string;
  /** 서랍 머리의 작은 문맥(학생 이름 등). */
  readonly caption?: string;
  readonly children: ReactNode;
  onClose: () => void;
}

export function EvidenceDrawer({ title, caption, children, onClose }: EvidenceDrawerProps) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // 열릴 때 닫기 단추로 포커스를 옮기고, 닫힐 때 열기 전 요소로 되돌린다.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-sp-modal flex justify-end" role="presentation">
      <button
        type="button"
        aria-label="서랍 닫기"
        onClick={onClose}
        className="flex-1 cursor-default bg-black/30"
      />
      <aside
        data-sp-floating
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-[440px] max-w-[92vw] flex-col overflow-y-auto border-l border-sp-border bg-sp-card p-3 shadow-xl"
      >
        <div className="mb-2 flex items-center gap-2">
          <h3 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold text-sp-text">
            {title}
            {caption ? (
              <span className="ml-2 text-xs font-normal text-sp-muted">{caption}</span>
            ) : null}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
            aria-label="닫기"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
        {children}
      </aside>
    </div>,
    document.body,
  );
}

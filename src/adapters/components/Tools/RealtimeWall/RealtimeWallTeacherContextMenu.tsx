import { useEffect, useRef } from 'react';

/**
 * v2.1 Phase D — 교사 카드 우클릭 컨텍스트 메뉴 (Plan FR-D7/D8 / Design v2.1 §11.1).
 *
 * 카드 우클릭 → 메뉴 표시:
 *   - "이 작성자의 다른 카드 보기" (D6 — 같은 sessionToken/PIN hash 카드 강조)
 *   - "닉네임 변경" (D7 — 즉시 broadcast)
 *   - "이 학생 카드 모두 숨김" (D7 — 같은 sessionToken/PIN 일괄 hidden)
 *
 * 위치는 부모가 좌표 전달 (anchorRect — 카드 우상단). ESC/외부 클릭 시 닫힘.
 */

export interface RealtimeWallTeacherContextMenuProps {
  readonly open: boolean;
  readonly anchorRect: DOMRect | null;
  readonly onClose: () => void;
  readonly onTrackAuthor?: () => void;
  readonly onUpdateNickname?: () => void;
  readonly onBulkHideStudent?: () => void;
}

export function RealtimeWallTeacherContextMenu({
  open,
  anchorRect,
  onClose,
  onTrackAuthor,
  onUpdateNickname,
  onBulkHideStudent,
}: RealtimeWallTeacherContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // 다음 tick에 등록 (오픈 클릭 자체 caputre 방지)
    const t = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  // 화면 우측 잘림 보호: anchor 우측 + 8px, 화면 너비 - 메뉴 너비 - 16 사이로 클램프
  const menuWidth = 220;
  const screenW = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const left = Math.min(
    Math.max(anchorRect.left + anchorRect.width / 2 - menuWidth / 2, 16),
    screenW - menuWidth - 16,
  );
  const top = Math.min(
    anchorRect.bottom + 4,
    typeof window !== 'undefined' ? window.innerHeight - 200 : 600,
  );

  if (!onTrackAuthor && !onUpdateNickname && !onBulkHideStudent) return null;

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="작성자 모더레이션 메뉴"
      style={{
        position: 'fixed',
        left,
        top,
        width: menuWidth,
      }}
      className="z-sp-tooltip overflow-hidden rounded-lg border border-sp-border bg-sp-card shadow-xl"
    >
      {onTrackAuthor && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onTrackAuthor();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sp-text transition hover:bg-sp-surface"
        >
          <span className="material-symbols-outlined text-[16px] text-sky-400">
            person_search
          </span>
          이 작성자의 다른 카드 보기
        </button>
      )}
      {onUpdateNickname && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onUpdateNickname();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-sp-text transition hover:bg-sp-surface"
        >
          <span className="material-symbols-outlined text-[16px] text-amber-400">
            badge
          </span>
          닉네임 변경
        </button>
      )}
      {onBulkHideStudent && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onBulkHideStudent();
            onClose();
          }}
          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-rose-400 transition hover:bg-rose-500/10"
        >
          <span className="material-symbols-outlined text-[16px]">visibility_off</span>
          이 학생 카드 모두 숨김
        </button>
      )}
    </div>
  );
}

import { useState, useRef, useEffect } from 'react';
import type { Bookmark } from '@domain/entities/Bookmark';

interface BookmarkCardProps {
  bookmark: Bookmark;
  editMode: boolean;
  onEdit: (bookmark: Bookmark) => void;
  onDelete: (id: string) => void;
  onDragStart?: (e: React.DragEvent, bookmark: Bookmark) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent, bookmark: Bookmark) => void;
}

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
    }
  }
}

export function BookmarkCard({
  bookmark,
  editMode,
  onEdit,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
}: BookmarkCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const handleClick = () => {
    if (editMode) {
      onEdit(bookmark);
    } else {
      openExternal(bookmark.url);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  };

  const handleCopyUrl = async () => {
    await navigator.clipboard.writeText(bookmark.url);
    setShowMenu(false);
  };

  return (
    <div
      className="relative"
      onDragOver={editMode ? onDragOver : undefined}
      onDrop={editMode ? (e) => onDrop?.(e, bookmark) : undefined}
    >
      <button
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable={editMode}
        onDragStart={editMode ? (e) => onDragStart?.(e, bookmark) : undefined}
        className={`w-full bg-sp-card rounded-2xl p-4 text-left border border-transparent hover:border-blue-500/30 hover:scale-[1.02] transition-all group ${
          editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        }`}
      >
        {/* 편집 모드 오버레이 */}
        {editMode && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <span
              onClick={(e) => { e.stopPropagation(); onEdit(bookmark); }}
              className="material-symbols-outlined text-[16px] text-sp-muted hover:text-sp-accent cursor-pointer p-1 rounded bg-sp-surface/80"
            >
              edit
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }}
              className="material-symbols-outlined text-[16px] text-sp-muted hover:text-red-400 cursor-pointer p-1 rounded bg-sp-surface/80"
            >
              delete
            </span>
          </div>
        )}

        {/* 드래그 핸들 */}
        {editMode && (
          <span className="material-symbols-outlined text-[16px] text-sp-muted absolute top-2 left-2">
            drag_indicator
          </span>
        )}

        {/* 아이콘 */}
        <div className="text-3xl mb-2">
          {bookmark.iconType === 'favicon' ? (
            <img
              src={bookmark.iconValue}
              alt={bookmark.name}
              className="w-8 h-8 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            bookmark.iconValue
          )}
        </div>

        {/* 이름 + 외부 링크 아이콘 */}
        <h4 className="text-sm font-semibold text-white group-hover:text-sp-accent transition-colors flex items-center gap-1 truncate">
          {bookmark.name}
          {!editMode && (
            <span className="material-symbols-outlined text-[14px] text-sp-muted">
              open_in_new
            </span>
          )}
        </h4>
      </button>

      {/* 컨텍스트 메뉴 */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 bg-sp-surface border border-sp-border rounded-lg shadow-xl z-50 py-1 min-w-[140px]"
        >
          <button
            onClick={() => { onEdit(bookmark); setShowMenu(false); }}
            className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>
            편집
          </button>
          <button
            onClick={() => void handleCopyUrl()}
            className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            URL 복사
          </button>
          <button
            onClick={() => { onDelete(bookmark.id); setShowMenu(false); }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-sp-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

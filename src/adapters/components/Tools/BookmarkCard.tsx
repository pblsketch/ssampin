import { useState, useRef, useEffect } from 'react';
import type { Bookmark } from '@domain/entities/Bookmark';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { isBookmarkForgotten } from '@domain/rules/bookmarkRules';

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
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { track } = useAnalytics();
  const recordClick = useBookmarkStore((s) => s.recordClick);

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
      return;
    }

    const type = bookmark.type ?? 'url';
    track('bookmark_click', { url: bookmark.url, type });
    void recordClick(bookmark.id);

    if (type === 'folder') {
      if (window.electronAPI?.openPath) {
        void window.electronAPI.openPath(bookmark.url);
      } else {
        alert('PC 폴더는 데스크톱 앱에서만 열 수 있어요.');
      }
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

  const showThumbnail = !!bookmark.ogImageUrl && !thumbnailFailed;
  const description = bookmark.ogDescription?.trim() || bookmark.ogTitle?.trim();
  const forgotten = !editMode && isBookmarkForgotten(bookmark);

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
        title={forgotten ? '오랜만이에요 — 30일 이상 방문하지 않은 사이트입니다.' : bookmark.name}
        className={`w-full bg-sp-card rounded-2xl p-4 text-left border border-transparent hover:border-blue-500/30 hover:scale-[1.02] transition-all group min-h-[110px] ${
          editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
        }`}
      >
        {/* 편집 모드 오버레이 */}
        {editMode && (
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            <span
              onClick={(e) => { e.stopPropagation(); onEdit(bookmark); }}
              className="material-symbols-outlined text-icon text-sp-muted hover:text-sp-accent cursor-pointer p-1 rounded bg-sp-surface/80"
            >
              edit
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onDelete(bookmark.id); }}
              className="material-symbols-outlined text-icon text-sp-muted hover:text-red-400 cursor-pointer p-1 rounded bg-sp-surface/80"
            >
              delete
            </span>
          </div>
        )}

        {/* 드래그 핸들 */}
        {editMode && (
          <span className="material-symbols-outlined text-icon text-sp-muted absolute top-2 left-2">
            drag_indicator
          </span>
        )}

        {/* 미사용 뱃지 */}
        {forgotten && (
          <span
            className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400/80"
            aria-label="오랜만이에요"
          />
        )}

        {/* 아이콘 또는 OG 썸네일 */}
        <div className="mb-2 h-12 flex items-center">
          {showThumbnail ? (
            <img
              src={bookmark.ogImageUrl}
              alt={bookmark.name}
              className="w-12 h-12 rounded-lg object-cover"
              onError={() => setThumbnailFailed(true)}
            />
          ) : bookmark.iconType === 'favicon' ? (
            <img
              src={bookmark.iconValue}
              alt={bookmark.name}
              className="w-8 h-8 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <span className="text-3xl">{bookmark.iconValue}</span>
          )}
        </div>

        {/* 이름 + 외부 링크/폴더 아이콘 */}
        <h4 className="text-sm font-semibold text-sp-text group-hover:text-sp-accent transition-colors flex items-center gap-1 truncate">
          {bookmark.name}
          {!editMode && (
            <span className="material-symbols-outlined text-icon-sm text-sp-muted">
              {bookmark.type === 'folder' ? 'folder_open' : 'open_in_new'}
            </span>
          )}
        </h4>

        {/* OG 설명 (1줄 말줄임) */}
        {description && (
          <p className="text-xs text-sp-muted truncate mt-1" title={description}>
            {description}
          </p>
        )}
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
            <span className="material-symbols-outlined text-icon">edit</span>
            편집
          </button>
          <button
            onClick={() => void handleCopyUrl()}
            className="w-full px-4 py-2 text-left text-sm text-sp-text hover:bg-sp-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-icon">content_copy</span>
            {bookmark.type === 'folder' ? '경로 복사' : 'URL 복사'}
          </button>
          <button
            onClick={() => { onDelete(bookmark.id); setShowMenu(false); }}
            className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-sp-card flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-icon">delete</span>
            삭제
          </button>
        </div>
      )}
    </div>
  );
}

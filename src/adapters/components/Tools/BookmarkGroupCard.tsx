import { useCallback } from 'react';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import { sortBookmarksByOrder, getBookmarksByGroup } from '@domain/rules/bookmarkRules';
import { BookmarkCard } from './BookmarkCard';

interface BookmarkGroupCardProps {
  group: BookmarkGroup;
  bookmarks: readonly Bookmark[];
  editMode: boolean;
  onEditGroup: (group: BookmarkGroup) => void;
  onDeleteGroup: (id: string) => void;
  onEditBookmark: (bookmark: Bookmark) => void;
  onDeleteBookmark: (id: string) => void;
  onToggleCollapse: (groupId: string) => void;
  onReorderBookmarks: (groupId: string, orderedIds: string[]) => void;
  onDragGroupStart?: (e: React.DragEvent, group: BookmarkGroup) => void;
  onDragGroupOver?: (e: React.DragEvent) => void;
  onDropGroup?: (e: React.DragEvent, group: BookmarkGroup) => void;
  /** 아카이브/복원 토글 — 미지정 시 버튼 숨김 */
  onArchiveGroup?: (id: string) => void;
  onUnarchiveGroup?: (id: string) => void;
  /** 검색/필터로 표시할 북마크가 그룹 자체와 다를 때 사용. 미지정 시 그룹 전체 사용. */
  visibleBookmarks?: readonly Bookmark[];
}

export function BookmarkGroupCard({
  group,
  bookmarks,
  editMode,
  onEditGroup,
  onDeleteGroup,
  onEditBookmark,
  onDeleteBookmark,
  onToggleCollapse,
  onReorderBookmarks,
  onDragGroupStart,
  onDragGroupOver,
  onDropGroup,
  onArchiveGroup,
  onUnarchiveGroup,
  visibleBookmarks,
}: BookmarkGroupCardProps) {
  const groupBookmarks = visibleBookmarks
    ? sortBookmarksByOrder(visibleBookmarks.filter((b) => b.groupId === group.id))
    : getBookmarksByGroup(bookmarks, group.id);

  const handleBookmarkDragStart = useCallback(
    (e: React.DragEvent, bookmark: Bookmark) => {
      e.dataTransfer.setData('application/bookmark-id', bookmark.id);
      e.dataTransfer.setData('application/group-id', group.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    [group.id],
  );

  const handleBookmarkDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleBookmarkDrop = useCallback(
    (e: React.DragEvent, targetBookmark: Bookmark) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('application/bookmark-id');
      const sourceGroupId = e.dataTransfer.getData('application/group-id');
      if (!draggedId || draggedId === targetBookmark.id) return;
      if (sourceGroupId !== group.id) return;

      const sorted = sortBookmarksByOrder(
        bookmarks.filter((b) => b.groupId === group.id),
      );
      const ids = sorted.map((b) => b.id);
      const fromIndex = ids.indexOf(draggedId);
      const toIndex = ids.indexOf(targetBookmark.id);
      if (fromIndex === -1 || toIndex === -1) return;

      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, draggedId);
      onReorderBookmarks(group.id, ids);
    },
    [bookmarks, group.id, onReorderBookmarks],
  );

  return (
    <div
      className="mb-6"
      draggable={editMode}
      onDragStart={editMode ? (e) => onDragGroupStart?.(e, group) : undefined}
      onDragOver={editMode ? (e) => { e.preventDefault(); onDragGroupOver?.(e); } : undefined}
      onDrop={editMode ? (e) => onDropGroup?.(e, group) : undefined}
    >
      {/* 그룹 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        {editMode && (
          <span className="material-symbols-outlined text-icon-md text-sp-muted cursor-grab">
            drag_indicator
          </span>
        )}

        <button
          onClick={() => onToggleCollapse(group.id)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <span className="text-xl">{group.emoji}</span>
          <h3 className="text-lg font-bold text-sp-text">{group.name}</h3>
          <span className="text-sm text-sp-muted">({groupBookmarks.length})</span>
          <span className={`material-symbols-outlined text-icon-md text-sp-muted transition-transform ${group.collapsed ? '' : 'rotate-180'}`}>
            expand_more
          </span>
        </button>

        {editMode && (
          <div className="flex gap-1">
            <button
              onClick={() => onEditGroup(group)}
              className="p-1 rounded hover:bg-sp-card text-sp-muted hover:text-sp-accent transition-colors"
              title="그룹 편집"
            >
              <span className="material-symbols-outlined text-icon-md">edit</span>
            </button>
            {group.archived
              ? onUnarchiveGroup && (
                  <button
                    onClick={() => onUnarchiveGroup(group.id)}
                    className="p-1 rounded hover:bg-sp-card text-sp-muted hover:text-sp-accent transition-colors"
                    title="아카이브 해제 (복원)"
                  >
                    <span className="material-symbols-outlined text-icon-md">unarchive</span>
                  </button>
                )
              : onArchiveGroup && (
                  <button
                    onClick={() => onArchiveGroup(group.id)}
                    className="p-1 rounded hover:bg-sp-card text-sp-muted hover:text-amber-400 transition-colors"
                    title="아카이브 (숨기기)"
                  >
                    <span className="material-symbols-outlined text-icon-md">archive</span>
                  </button>
                )}
            <button
              onClick={() => onDeleteGroup(group.id)}
              className="p-1 rounded hover:bg-sp-card text-sp-muted hover:text-red-400 transition-colors"
              title="그룹 삭제"
            >
              <span className="material-symbols-outlined text-icon-md">delete</span>
            </button>
          </div>
        )}
      </div>

      {/* 그룹 내 즐겨찾기 그리드 */}
      {!group.collapsed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {groupBookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              editMode={editMode}
              onEdit={onEditBookmark}
              onDelete={onDeleteBookmark}
              onDragStart={handleBookmarkDragStart}
              onDragOver={handleBookmarkDragOver}
              onDrop={handleBookmarkDrop}
            />
          ))}
        </div>
      )}
    </div>
  );
}

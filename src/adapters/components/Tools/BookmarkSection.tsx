import { useEffect, useState, useCallback } from 'react';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import { sortGroupsByOrder } from '@domain/rules/bookmarkRules';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { BookmarkGroupCard } from './BookmarkGroupCard';
import { BookmarkFormModal } from './BookmarkFormModal';
import { BookmarkGroupModal } from './BookmarkGroupModal';

export function BookmarkSection() {
  const {
    groups,
    bookmarks,
    isLoading,
    loadAll,
    addBookmark,
    updateBookmark,
    deleteBookmark,
    addGroup,
    updateGroup,
    deleteGroup,
    reorderBookmarks,
    reorderGroups,
    addDefaultPresets,
    toggleGroupCollapse,
  } = useBookmarkStore();

  const { track } = useAnalytics();
  const [editMode, setEditMode] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingGroup, setEditingGroup] = useState<BookmarkGroup | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 토스트 자동 숨김
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const sortedGroups = sortGroupsByOrder(groups);

  const handleEditBookmark = useCallback((bookmark: Bookmark) => {
    setEditingBookmark(bookmark);
    setShowBookmarkModal(true);
  }, []);

  const handleDeleteBookmark = useCallback(
    async (id: string) => {
      await deleteBookmark(id);
    },
    [deleteBookmark],
  );

  const handleEditGroup = useCallback((group: BookmarkGroup) => {
    setEditingGroup(group);
    setShowGroupModal(true);
  }, []);

  const handleDeleteGroup = useCallback(
    async (id: string) => {
      const count = bookmarks.filter((b) => b.groupId === id).length;
      if (count > 0) {
        const ok = window.confirm(
          `이 그룹에 ${count}개의 즐겨찾기가 있습니다. 모두 삭제하시겠습니까?`,
        );
        if (!ok) return;
      }
      await deleteGroup(id);
    },
    [bookmarks, deleteGroup],
  );

  const handleAddDefaultPresets = async () => {
    const result = await addDefaultPresets();
    setToastMessage(
      `기본 즐겨찾기가 추가되었습니다! (${result.groupCount}개 그룹, ${result.bookmarkCount}개 사이트)`,
    );
  };

  // 그룹 드래그앤드롭
  const handleGroupDragStart = useCallback(
    (e: React.DragEvent, group: BookmarkGroup) => {
      e.dataTransfer.setData('application/group-drag-id', group.id);
      e.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleGroupDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleGroupDrop = useCallback(
    (e: React.DragEvent, targetGroup: BookmarkGroup) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData('application/group-drag-id');
      if (!draggedId || draggedId === targetGroup.id) return;

      const sorted = sortGroupsByOrder(groups);
      const ids = sorted.map((g) => g.id);
      const fromIndex = ids.indexOf(draggedId);
      const toIndex = ids.indexOf(targetGroup.id);
      if (fromIndex === -1 || toIndex === -1) return;

      ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, draggedId);
      void reorderGroups(ids);
    },
    [groups, reorderGroups],
  );

  const handleBookmarkSave = async (
    data: { name: string; url: string; type: 'url' | 'folder'; iconType: 'emoji' | 'favicon'; iconValue: string; groupId: string },
  ) => {
    if (editingBookmark) {
      await updateBookmark(editingBookmark.id, data);
    } else {
      const groupBookmarks = bookmarks.filter((b) => b.groupId === data.groupId);
      const maxOrder = groupBookmarks.length > 0
        ? Math.max(...groupBookmarks.map((b) => b.order)) + 1
        : 0;
      await addBookmark({ ...data, order: maxOrder });
      track('bookmark_add', { url: data.url });
    }
    setShowBookmarkModal(false);
    setEditingBookmark(null);
  };

  const handleGroupSave = async (data: { name: string; emoji: string }) => {
    if (editingGroup) {
      await updateGroup(editingGroup.id, data);
    } else {
      const maxOrder = groups.length > 0
        ? Math.max(...groups.map((g) => g.order)) + 1
        : 0;
      await addGroup({ ...data, order: maxOrder, collapsed: false });
    }
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  if (isLoading) {
    return (
      <div className="text-center text-sp-muted py-8">
        불러오는 중...
      </div>
    );
  }

  const isEmpty = groups.length === 0 && bookmarks.length === 0;

  return (
    <div>
      {/* 액션 버튼 */}
      <div className="flex items-center justify-end mb-6">

        <div className="flex items-center gap-2">
          {!isEmpty && (
            <>
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setShowGroupModal(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
                그룹 추가
              </button>
              <button
                onClick={() => {
                  setEditingBookmark(null);
                  setShowBookmarkModal(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                즐겨찾기 추가
              </button>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  editMode
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-card hover:bg-sp-border text-sp-text'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">
                  {editMode ? 'check' : 'edit'}
                </span>
                {editMode ? '완료' : '편집'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 빈 상태 */}
      {isEmpty && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <span className="text-6xl mb-4">🔗</span>
          <h3 className="text-lg font-semibold text-white mb-2">
            아직 즐겨찾기가 없습니다
          </h3>
          <p className="text-sp-muted mb-6 max-w-md">
            자주 사용하는 교육 사이트를 즐겨찾기에 추가하면<br />
            빠르게 접근할 수 있습니다.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => void handleAddDefaultPresets()}
              className="px-5 py-2.5 rounded-xl bg-sp-accent hover:bg-blue-600 text-white font-medium transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
              기본 즐겨찾기 추가
            </button>
            <button
              onClick={() => {
                setEditingBookmark(null);
                setShowBookmarkModal(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-sp-card hover:bg-sp-border text-sp-text font-medium transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              직접 추가
            </button>
          </div>
        </div>
      )}

      {/* 그룹 목록 */}
      {sortedGroups.map((group) => (
        <BookmarkGroupCard
          key={group.id}
          group={group}
          bookmarks={bookmarks}
          editMode={editMode}
          onEditGroup={handleEditGroup}
          onDeleteGroup={(id) => void handleDeleteGroup(id)}
          onEditBookmark={handleEditBookmark}
          onDeleteBookmark={(id) => void handleDeleteBookmark(id)}
          onToggleCollapse={(id) => void toggleGroupCollapse(id)}
          onReorderBookmarks={(gid, ids) => void reorderBookmarks(gid, ids)}
          onDragGroupStart={handleGroupDragStart}
          onDragGroupOver={handleGroupDragOver}
          onDropGroup={handleGroupDrop}
        />
      ))}

      {/* 모달 */}
      {showBookmarkModal && (
        <BookmarkFormModal
          bookmark={editingBookmark}
          groups={groups}
          onSave={(data) => void handleBookmarkSave(data)}
          onClose={() => { setShowBookmarkModal(false); setEditingBookmark(null); }}
        />
      )}

      {showGroupModal && (
        <BookmarkGroupModal
          group={editingGroup}
          onSave={(data) => void handleGroupSave(data)}
          onClose={() => { setShowGroupModal(false); setEditingGroup(null); }}
        />
      )}

      {/* 토스트 */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-sp-surface border border-sp-border text-sp-text px-6 py-3 rounded-xl shadow-xl z-50 animate-fade-in">
          {toastMessage}
        </div>
      )}
    </div>
  );
}

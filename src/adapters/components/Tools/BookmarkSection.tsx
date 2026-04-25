import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import {
  sortGroupsByOrder,
  filterActiveGroups,
  filterArchivedGroups,
  filterBookmarksBySearch,
  findForgottenBookmarks,
} from '@domain/rules/bookmarkRules';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useToolKeydown } from '@adapters/hooks/useToolKeydown';
import { BookmarkGroupCard } from './BookmarkGroupCard';
import { BookmarkFormModal, type BookmarkFormSaveData } from './BookmarkFormModal';
import { BookmarkGroupModal } from './BookmarkGroupModal';
import { BookmarkImportExportModal } from './BookmarkImportExportModal';

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
    archiveGroup,
    unarchiveGroup,
  } = useBookmarkStore();

  const recordClick = useBookmarkStore((s) => s.recordClick);

  const { track } = useAnalytics();
  const [editMode, setEditMode] = useState(false);
  const [showBookmarkModal, setShowBookmarkModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [editingBookmark, setEditingBookmark] = useState<Bookmark | null>(null);
  const [editingGroup, setEditingGroup] = useState<BookmarkGroup | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  // 검색
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  // 아카이브 보기 토글
  const [showArchived, setShowArchived] = useState(false);
  // "잊고 있던 사이트" 섹션 접힘 상태
  const [forgottenCollapsed, setForgottenCollapsed] = useState(false);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 검색어 디바운스 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // 토스트 자동 숨김
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  // 페이지 로컬 단축키 — "즐겨찾기 추가"는 글로벌 단축키(설정 > 단축키)로 통합되어 있어 여기서는 다루지 않음.
  // 페이지 컨텍스트에서만 의미가 있는 단축키만 처리: 그룹 추가 / 편집 모드 / 검색 포커스.
  useToolKeydown(
    (e) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (showBookmarkModal || showGroupModal || showImportExportModal) return;

      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        setEditingGroup(null);
        setShowGroupModal(true);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setEditMode((m) => !m);
        return;
      }
      if (ctrl && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === '/' && !ctrl && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
    },
    [showBookmarkModal, showGroupModal, showImportExportModal],
  );

  const sortedGroups = useMemo(() => sortGroupsByOrder(groups), [groups]);
  const activeGroups = useMemo(() => filterActiveGroups(sortedGroups), [sortedGroups]);
  const archivedGroups = useMemo(() => filterArchivedGroups(sortedGroups), [sortedGroups]);

  // 검색 적용된 북마크 (전체)
  const filteredBookmarks = useMemo(
    () => filterBookmarksBySearch(bookmarks, debouncedQuery),
    [bookmarks, debouncedQuery],
  );
  // 검색 결과로 표시할 활성 그룹 (검색 시 매칭된 북마크가 있는 그룹만)
  const displayedActiveGroups = useMemo(() => {
    if (!debouncedQuery.trim()) return activeGroups;
    const groupIdsWithMatches = new Set(filteredBookmarks.map((b) => b.groupId));
    return activeGroups.filter((g) => groupIdsWithMatches.has(g.id));
  }, [activeGroups, filteredBookmarks, debouncedQuery]);

  // 잊고 있던 사이트 — 활성 그룹의 폴더 아닌 북마크 중 30일 이상 미사용
  const forgottenBookmarks = useMemo(() => {
    const activeGroupIds = new Set(activeGroups.map((g) => g.id));
    const candidates = bookmarks.filter((b) => activeGroupIds.has(b.groupId));
    return findForgottenBookmarks(candidates, { limit: 6 });
  }, [bookmarks, activeGroups]);

  const handleOpenBookmark = useCallback(
    (bookmark: Bookmark) => {
      void recordClick(bookmark.id);
      const type = bookmark.type ?? 'url';
      if (type === 'folder') {
        if (window.electronAPI?.openPath) void window.electronAPI.openPath(bookmark.url);
      } else if (window.electronAPI?.openExternal) {
        void window.electronAPI.openExternal(bookmark.url);
      } else {
        window.open(bookmark.url, '_blank', 'noopener,noreferrer');
      }
    },
    [recordClick],
  );

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

  const handleArchiveGroup = useCallback(
    async (id: string) => {
      await archiveGroup(id);
      setToastMessage('그룹이 아카이브되었습니다. 페이지 하단에서 복원할 수 있어요.');
    },
    [archiveGroup],
  );

  const handleUnarchiveGroup = useCallback(
    async (id: string) => {
      await unarchiveGroup(id);
      setToastMessage('그룹이 복원되었습니다.');
    },
    [unarchiveGroup],
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

  const handleBookmarkSave = async (data: BookmarkFormSaveData) => {
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
      {/* 검색바 + 액션 버튼 */}
      <div className="flex items-center gap-3 mb-6">
        {!isEmpty && !editMode && (
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-icon text-sp-muted">
              search
            </span>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="이름, URL, 설명에서 검색…  (Ctrl+F 또는 /)"
              className="w-full bg-sp-card border border-sp-border rounded-lg pl-10 pr-9 py-2 text-sm text-sp-text placeholder-sp-muted/60 focus:border-sp-accent focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-sp-muted hover:text-sp-text"
                aria-label="검색어 지우기"
              >
                <span className="material-symbols-outlined text-icon">close</span>
              </button>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {!isEmpty && (
            <>
              <button
                onClick={() => setShowImportExportModal(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors flex items-center gap-1"
                title="가져오기 / 내보내기"
              >
                <span className="material-symbols-outlined text-icon">swap_vert</span>
                가져오기/내보내기
              </button>
              <button
                onClick={() => {
                  setEditingGroup(null);
                  setShowGroupModal(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-sp-card hover:bg-sp-border text-sp-text transition-colors flex items-center gap-1"
                title="그룹 추가 (Ctrl+G)"
              >
                <span className="material-symbols-outlined text-icon">create_new_folder</span>
                그룹 추가
              </button>
              <button
                onClick={() => {
                  setEditingBookmark(null);
                  setShowBookmarkModal(true);
                }}
                className="px-3 py-1.5 text-sm rounded-lg bg-sp-accent hover:bg-blue-600 text-white transition-colors flex items-center gap-1"
                title="즐겨찾기 추가"
              >
                <span className="material-symbols-outlined text-icon">add</span>
                즐겨찾기 추가
              </button>
              <button
                onClick={() => setEditMode(!editMode)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1 ${
                  editMode
                    ? 'bg-sp-accent text-white'
                    : 'bg-sp-card hover:bg-sp-border text-sp-text'
                }`}
                title="편집 모드 토글 (Ctrl+E)"
              >
                <span className="material-symbols-outlined text-icon">
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
          <h3 className="text-lg font-semibold text-sp-text mb-2">
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
              <span className="material-symbols-outlined text-icon-md">auto_awesome</span>
              기본 즐겨찾기 추가
            </button>
            <button
              onClick={() => {
                setEditingBookmark(null);
                setShowBookmarkModal(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-sp-card hover:bg-sp-border text-sp-text font-medium transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-icon-md">add</span>
              직접 추가
            </button>
          </div>
        </div>
      )}

      {/* 잊고 있던 사이트 — 검색/편집 모드에서는 숨김 */}
      {!isEmpty && !editMode && !debouncedQuery.trim() && forgottenBookmarks.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
          <button
            onClick={() => setForgottenCollapsed((v) => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <span className="text-base">🔔</span>
            <h3 className="text-sm font-semibold text-sp-text">잊고 있던 사이트</h3>
            <span className="text-xs text-sp-muted">
              ({forgottenBookmarks.length}개 · 30일 이상 안 들어간 사이트)
            </span>
            <span
              className={`material-symbols-outlined text-icon-md text-sp-muted ml-auto transition-transform ${
                forgottenCollapsed ? '' : 'rotate-180'
              }`}
            >
              expand_more
            </span>
          </button>
          {!forgottenCollapsed && (
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {forgottenBookmarks.map((bm) => (
                <button
                  key={bm.id}
                  onClick={() => handleOpenBookmark(bm)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-sp-card hover:bg-sp-border text-left transition-colors min-w-0"
                  title={bm.url}
                >
                  <span className="text-base flex-shrink-0">
                    {bm.iconType === 'favicon' ? (
                      <img
                        src={bm.iconValue}
                        alt=""
                        className="w-4 h-4 rounded"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      bm.iconValue
                    )}
                  </span>
                  <span className="text-xs text-sp-text truncate group-hover:text-sp-accent">
                    {bm.name}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 검색 결과 안내 */}
      {!isEmpty && debouncedQuery.trim() && displayedActiveGroups.length === 0 && (
        <div className="text-center text-sp-muted py-8">
          "{debouncedQuery}"와 일치하는 즐겨찾기가 없습니다.
        </div>
      )}

      {/* 활성 그룹 목록 */}
      {displayedActiveGroups.map((group) => (
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
          onArchiveGroup={(id) => void handleArchiveGroup(id)}
          onUnarchiveGroup={(id) => void handleUnarchiveGroup(id)}
          visibleBookmarks={debouncedQuery.trim() ? filteredBookmarks : undefined}
        />
      ))}

      {/* 아카이브 토글 */}
      {!isEmpty && archivedGroups.length > 0 && (
        <div className="mt-8 border-t border-sp-border pt-6">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-2 text-sm text-sp-muted hover:text-sp-text transition-colors"
          >
            <span className={`material-symbols-outlined text-icon-md transition-transform ${showArchived ? 'rotate-180' : ''}`}>
              expand_more
            </span>
            <span className="material-symbols-outlined text-icon-md">archive</span>
            아카이브된 그룹 ({archivedGroups.length}개)
          </button>

          {showArchived && (
            <div className="mt-4 opacity-75">
              {archivedGroups.map((group) => (
                <BookmarkGroupCard
                  key={group.id}
                  group={group}
                  bookmarks={bookmarks}
                  editMode={true} /* 아카이브 영역은 항상 편집 액션(복원/삭제) 노출 */
                  onEditGroup={handleEditGroup}
                  onDeleteGroup={(id) => void handleDeleteGroup(id)}
                  onEditBookmark={handleEditBookmark}
                  onDeleteBookmark={(id) => void handleDeleteBookmark(id)}
                  onToggleCollapse={(id) => void toggleGroupCollapse(id)}
                  onReorderBookmarks={(gid, ids) => void reorderBookmarks(gid, ids)}
                  onArchiveGroup={(id) => void handleArchiveGroup(id)}
                  onUnarchiveGroup={(id) => void handleUnarchiveGroup(id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

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

      {showImportExportModal && (
        <BookmarkImportExportModal
          onClose={() => setShowImportExportModal(false)}
          onResultMessage={(msg) => setToastMessage(msg)}
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

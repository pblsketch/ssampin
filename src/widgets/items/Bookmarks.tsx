import { useEffect, useMemo, useState } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';
import {
  sortGroupsByOrder,
  getBookmarksByGroup,
  filterVisibleGroups,
  filterVisibleBookmarks,
} from '@domain/rules/bookmarkRules';

function openBookmark(bookmark: Bookmark) {
  const type = bookmark.type ?? 'url';
  if (type === 'folder') {
    if (window.electronAPI?.openPath) {
      void window.electronAPI.openPath(bookmark.url);
    }
  } else {
    if (window.electronAPI?.openExternal) {
      void window.electronAPI.openExternal(bookmark.url);
    } else {
      window.open(bookmark.url, '_blank', 'noopener,noreferrer');
    }
  }
}

export function BookmarksWidget() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const groups = useBookmarkStore((s) => s.groups);
  const loadAll = useBookmarkStore((s) => s.loadAll);

  const hiddenGroups = useSettingsStore((s) => s.settings.bookmarkWidgetHiddenGroups) ?? [];
  const hiddenBookmarks = useSettingsStore((s) => s.settings.bookmarkWidgetHiddenBookmarks) ?? [];
  const update = useSettingsStore((s) => s.update);

  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 숨김 설정 적용 후 그룹별 정리
  const groupedBookmarks = useMemo(() => {
    const visibleGroups = filterVisibleGroups(groups, hiddenGroups);
    const visibleBookmarks = filterVisibleBookmarks(bookmarks, hiddenBookmarks);
    const sortedGroups = sortGroupsByOrder(visibleGroups);
    return sortedGroups
      .map((group) => ({
        group,
        items: getBookmarksByGroup(visibleBookmarks, group.id),
      }))
      .filter(({ items }) => items.length > 0);
  }, [groups, bookmarks, hiddenGroups, hiddenBookmarks]);

  // 북마크가 아예 없으면 안내
  if (groups.length === 0 && bookmarks.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center">
        <span className="text-3xl mb-2">🔗</span>
        <p className="text-sm text-sp-muted">
          쌤도구에서 즐겨찾기를 추가해보세요
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-sp-text">즐겨찾기</h3>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-sp-muted hover:text-sp-text transition-colors"
          title="표시 항목 편집"
        >
          <span className="material-symbols-outlined text-sm">
            {showPicker ? 'close' : 'edit'}
          </span>
        </button>
      </div>

      {showPicker ? (
        <BookmarkVisibilityPicker
          groups={groups}
          bookmarks={bookmarks}
          hiddenGroups={[...hiddenGroups]}
          hiddenBookmarks={[...hiddenBookmarks]}
          onSave={(hGroups, hBookmarks) => {
            void update({
              bookmarkWidgetHiddenGroups: hGroups,
              bookmarkWidgetHiddenBookmarks: hBookmarks,
            });
            setShowPicker(false);
          }}
          onCancel={() => setShowPicker(false)}
        />
      ) : groupedBookmarks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-sp-muted">모든 항목이 숨김 처리되었습니다</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-6 overflow-auto">
          {groupedBookmarks.map(({ group, items }) => (
            <div key={group.id} className="min-w-0 flex-shrink-0">
              {/* 그룹 헤더 */}
              {groupedBookmarks.length > 1 && (
                <div className="flex items-center gap-1.5 px-1 mb-1">
                  <span className="text-xs">{group.emoji}</span>
                  <span className="text-[11px] font-semibold text-sp-muted uppercase tracking-wider">
                    {group.name}
                  </span>
                </div>
              )}

              {/* 그룹 내 북마크 */}
              <div className="space-y-0.5">
                {items.map((bookmark) => (
                  <button
                    key={bookmark.id}
                    onClick={() => openBookmark(bookmark)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sp-card transition-colors text-left group"
                  >
                    <span className="text-base flex-shrink-0">
                      {bookmark.iconType === 'favicon' ? (
                        <img src={bookmark.iconValue} alt="" className="w-4 h-4 rounded" />
                      ) : (
                        bookmark.iconValue
                      )}
                    </span>
                    <span className="text-sm text-sp-text truncate group-hover:text-sp-accent transition-colors whitespace-nowrap">
                      {bookmark.name}
                    </span>
                    <span className="material-symbols-outlined text-[12px] text-sp-muted ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {bookmark.type === 'folder' ? 'folder_open' : 'open_in_new'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── 표시 항목 편집 피커 ─── */

function BookmarkVisibilityPicker({
  groups,
  bookmarks,
  hiddenGroups,
  hiddenBookmarks,
  onSave,
  onCancel,
}: {
  groups: readonly BookmarkGroup[];
  bookmarks: readonly Bookmark[];
  hiddenGroups: string[];
  hiddenBookmarks: string[];
  onSave: (hiddenGroups: string[], hiddenBookmarks: string[]) => void;
  onCancel: () => void;
}) {
  const [hGroups, setHGroups] = useState<string[]>([...hiddenGroups]);
  const [hBookmarks, setHBookmarks] = useState<string[]>([...hiddenBookmarks]);

  const sortedGroups = useMemo(() => sortGroupsByOrder(groups), [groups]);

  const toggleGroup = (groupId: string) => {
    setHGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const toggleBookmark = (bookmarkId: string) => {
    setHBookmarks((prev) =>
      prev.includes(bookmarkId)
        ? prev.filter((id) => id !== bookmarkId)
        : [...prev, bookmarkId],
    );
  };

  const visibleCount = bookmarks.filter(
    (b) => !hGroups.includes(b.groupId) && !hBookmarks.includes(b.id),
  ).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <p className="text-[10px] text-sp-muted mb-2">
        대시보드에 표시할 즐겨찾기를 선택하세요
      </p>
      <div className="flex-1 overflow-y-auto space-y-1.5">
        {sortedGroups.map((group) => {
          const groupHidden = hGroups.includes(group.id);
          const groupBookmarks = getBookmarksByGroup(bookmarks, group.id);

          return (
            <div key={group.id}>
              {/* 그룹 체크박스 */}
              <label className="flex items-center gap-2 px-1 py-1 rounded-lg hover:bg-sp-border/20 cursor-pointer">
                <input
                  type="checkbox"
                  checked={!groupHidden}
                  onChange={() => toggleGroup(group.id)}
                  className="accent-blue-500 w-3.5 h-3.5"
                />
                <span className="text-xs">{group.emoji}</span>
                <span className="text-xs font-semibold text-sp-text">
                  {group.name}
                </span>
                <span className="text-[10px] text-sp-muted ml-auto">
                  {groupBookmarks.length}개
                </span>
              </label>

              {/* 그룹이 표시 중일 때만 개별 북마크 표시 */}
              {!groupHidden && groupBookmarks.length > 0 && (
                <div className="ml-5 space-y-0.5">
                  {groupBookmarks.map((bm) => (
                    <label
                      key={bm.id}
                      className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-sp-border/20 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!hBookmarks.includes(bm.id)}
                        onChange={() => toggleBookmark(bm.id)}
                        className="accent-blue-500 w-3 h-3"
                      />
                      <span className="text-xs flex-shrink-0">
                        {bm.iconType === 'favicon' ? (
                          <img src={bm.iconValue} alt="" className="w-3 h-3 rounded" />
                        ) : (
                          bm.iconValue
                        )}
                      </span>
                      <span className="text-xs text-sp-text truncate">
                        {bm.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 저장/취소 */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onSave(hGroups, hBookmarks)}
          className="flex-1 text-xs bg-sp-accent text-white rounded-lg py-1.5 hover:bg-blue-600 transition-colors"
        >
          저장 ({visibleCount}/{bookmarks.length}개 표시)
        </button>
        <button
          onClick={onCancel}
          className="flex-1 text-xs bg-sp-border text-sp-muted rounded-lg py-1.5 hover:bg-sp-border/80 transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  );
}

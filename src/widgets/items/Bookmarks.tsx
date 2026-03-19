import { useEffect, useMemo } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { sortGroupsByOrder, getBookmarksByGroup } from '@domain/rules/bookmarkRules';

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function BookmarksWidget() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const groups = useBookmarkStore((s) => s.groups);
  const loadAll = useBookmarkStore((s) => s.loadAll);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 그룹별로 북마크 정리 (그룹 순서 유지)
  const groupedBookmarks = useMemo(() => {
    const sortedGroups = sortGroupsByOrder(groups);
    return sortedGroups
      .map((group) => ({
        group,
        items: getBookmarksByGroup(bookmarks, group.id),
      }))
      .filter(({ items }) => items.length > 0);
  }, [groups, bookmarks]);

  if (groupedBookmarks.length === 0) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col items-center justify-center text-center">
        <span className="text-3xl mb-2">🔗</span>
        <p className="text-sm text-sp-muted">
          쌤도구에서 즐겨찾기를 추가해보세요
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-sp-card p-4 h-full flex gap-6 overflow-auto">
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
                onClick={() => openExternal(bookmark.url)}
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
                  open_in_new
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

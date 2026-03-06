import { useEffect } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { sortBookmarksByOrder } from '@domain/rules/bookmarkRules';

function openExternal(url: string) {
  if (window.electronAPI?.openExternal) {
    void window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export function BookmarksWidget() {
  const bookmarks = useBookmarkStore((s) => s.bookmarks);
  const loadAll = useBookmarkStore((s) => s.loadAll);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const sorted = sortBookmarksByOrder(bookmarks).slice(0, 8);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-4">
        <span className="text-3xl mb-2">🔗</span>
        <p className="text-sm text-sp-muted">
          쌤도구에서 즐겨찾기를 추가해보세요
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sorted.map((bookmark) => (
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
          <span className="text-sm text-sp-text truncate group-hover:text-sp-accent transition-colors">
            {bookmark.name}
          </span>
          <span className="material-symbols-outlined text-[12px] text-sp-muted ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            open_in_new
          </span>
        </button>
      ))}
    </div>
  );
}

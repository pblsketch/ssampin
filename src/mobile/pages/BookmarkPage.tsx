import { useEffect, useMemo, useState } from 'react';
import { useMobileBookmarkStore } from '@mobile/stores/useMobileBookmarkStore';
import type { Bookmark, BookmarkGroup } from '@domain/entities/Bookmark';

interface Props {
  onBack: () => void;
}

/** URL 에서 호스트만 뽑아 부제로 표시 (파싱 실패 시 원본). */
function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

/** 이모지/파비콘 아이콘 — 파비콘 로드 실패 시 링크 아이콘으로 폴백. */
function BookmarkIcon({ bookmark }: { bookmark: Bookmark }) {
  const [imgFailed, setImgFailed] = useState(false);

  if (bookmark.iconType === 'favicon' && bookmark.iconValue && !imgFailed) {
    return (
      <img
        src={bookmark.iconValue}
        alt=""
        aria-hidden
        className="w-6 h-6 rounded object-contain"
        onError={() => setImgFailed(true)}
      />
    );
  }
  if (bookmark.iconType === 'emoji' && bookmark.iconValue) {
    return <span className="text-xl leading-none">{bookmark.iconValue}</span>;
  }
  return <span className="material-symbols-outlined text-sp-muted text-icon-lg">link</span>;
}

function BookmarkRow({ bookmark }: { bookmark: Bookmark }) {
  const open = () => {
    if (!bookmark.url) return;
    window.open(bookmark.url, '_blank', 'noopener,noreferrer');
  };
  return (
    <button
      onClick={open}
      className="flex items-center gap-3 w-full px-4 py-3 glass-card active:scale-[0.98] transition-transform text-left"
      style={{ minHeight: 44 }}
    >
      <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-black/5 shrink-0">
        <BookmarkIcon bookmark={bookmark} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sp-text font-medium text-sm truncate">{bookmark.name}</p>
        <p className="text-sp-muted text-xs truncate">{hostOf(bookmark.url)}</p>
      </div>
      <span className="material-symbols-outlined text-sp-muted text-icon-lg shrink-0">
        open_in_new
      </span>
    </button>
  );
}

export function BookmarkPage({ onBack }: Props) {
  const groups = useMobileBookmarkStore((s) => s.groups);
  const bookmarks = useMobileBookmarkStore((s) => s.bookmarks);
  const loaded = useMobileBookmarkStore((s) => s.loaded);

  useEffect(() => {
    void useMobileBookmarkStore.getState().load();
  }, []);

  /** 표시 섹션: 보관 안 된 그룹(순서대로) + 각 그룹의 링크(폴더 제외, 순서대로). 그룹 없는 링크는 "기타". */
  const sections = useMemo(() => {
    const visibleGroups = groups
      .filter((g) => !g.archived)
      .slice()
      .sort((a, b) => a.order - b.order);
    const links = bookmarks.filter((b) => (b.type ?? 'url') !== 'folder');
    const byGroup = (groupId: string) =>
      links
        .filter((b) => b.groupId === groupId)
        .slice()
        .sort((a, b) => a.order - b.order);

    const result: { group: BookmarkGroup | null; items: Bookmark[] }[] = [];
    for (const g of visibleGroups) {
      const items = byGroup(g.id);
      if (items.length > 0) result.push({ group: g, items });
    }
    const knownGroupIds = new Set(visibleGroups.map((g) => g.id));
    const orphans = links
      .filter((b) => !knownGroupIds.has(b.groupId))
      .slice()
      .sort((a, b) => a.order - b.order);
    if (orphans.length > 0) result.push({ group: null, items: orphans });
    return result;
  }, [groups, bookmarks]);

  const isEmpty = loaded && sections.length === 0;

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-sp-border/30">
        <button onClick={onBack} className="text-sp-muted active:scale-95 transition-transform">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-base font-bold text-sp-text">즐겨찾기</h2>
      </header>

      {!loaded ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="material-symbols-outlined text-sp-accent text-3xl animate-spin">
            progress_activity
          </span>
        </div>
      ) : isEmpty ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
          <span className="material-symbols-outlined text-sp-muted text-4xl">bookmark</span>
          <p className="text-sp-muted text-sm leading-relaxed">
            즐겨찾기가 없어요.
            <br />
            PC 앱에서 즐겨찾기를 추가한 뒤 동기화하세요.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {sections.map(({ group, items }) => (
            <section key={group?.id ?? '__orphans__'}>
              <h3 className="text-sp-muted text-xs font-semibold uppercase tracking-wider mb-2 px-1">
                {group ? `${group.emoji ? `${group.emoji} ` : ''}${group.name}` : '기타'}
              </h3>
              <div className="space-y-2">
                {items.map((b) => (
                  <BookmarkRow key={b.id} bookmark={b} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

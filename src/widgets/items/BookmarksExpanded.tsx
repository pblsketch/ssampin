/**
 * BookmarksExpanded — WidgetModal 안에서 노출되는 북마크 풀 편집기.
 *
 * 그룹별 섹션 + 각 그룹 안 북마크 리스트 + "+ 새 북마크" 인라인 폼 +
 * 항목별 편집/삭제 + 5초 Undo.
 *
 * widget-expanded-editors Plan v0.1 Phase 4B.
 *
 * 단순화 정책:
 *  - 그룹 추가/이름변경/삭제는 본 Phase 범위 외 (별도 북마크 페이지 사용).
 *    Phase 4B 는 "북마크 자체"의 CRUD 만 집중.
 *  - 아이콘은 emoji 만 지원 — 사용자가 직접 입력. favicon 자동 fetch 미사용.
 */
import { useEffect, useMemo, useState } from 'react';
import { useBookmarkStore } from '@adapters/stores/useBookmarkStore';
import { useToastStore } from '@adapters/components/common/Toast';
import {
  sortGroupsByOrder,
  getBookmarksByGroup,
  filterVisibleGroups,
} from '@domain/rules/bookmarkRules';
import type { Bookmark } from '@domain/entities/Bookmark';

export function BookmarksExpanded() {
  const { groups, bookmarks, loadAll, addBookmark, updateBookmark, deleteBookmark } =
    useBookmarkStore();

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // hiddenGroupIds 는 본 확장 뷰 범위에서 다루지 않음 — 모든 그룹 노출
  const visibleGroups = useMemo(() => filterVisibleGroups(sortGroupsByOrder(groups), []), [groups]);

  // 어떤 그룹에 "+ 새 북마크" 폼이 열려있는지 (그룹 id → true)
  const [addingInGroup, setAddingInGroup] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleDelete = (b: Bookmark) => {
    void deleteBookmark(b.id);
    useToastStore.getState().show(
      '북마크 삭제됨',
      'success',
      {
        label: '되돌리기',
        onClick: () => {
          // 동일 필드로 재추가 — id/createdAt/updatedAt 는 store 가 새로 발급.
          void addBookmark({
            name: b.name,
            url: b.url,
            type: b.type,
            iconType: b.iconType,
            iconValue: b.iconValue,
            groupId: b.groupId,
            order: b.order,
          });
        },
      },
      5000,
    );
  };

  if (visibleGroups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-sp-muted">
        북마크 그룹이 없습니다. 자체 북마크 페이지에서 그룹을 먼저 만들어 주세요.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-3 overflow-y-auto widget-scroll -mr-2 pr-2">
      {visibleGroups.map((group) => {
        const groupBookmarks = getBookmarksByGroup(bookmarks, group.id);
        const isAdding = addingInGroup === group.id;
        return (
          <section key={group.id} className="rounded-xl bg-sp-card border border-sp-border p-3">
            <header className="mb-2 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-bold text-sp-text inline-flex items-center gap-1.5">
                <span aria-hidden="true">{group.emoji}</span>
                {group.name}
                <span className="text-xs font-normal text-sp-muted">({groupBookmarks.length})</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setAddingInGroup(isAdding ? null : group.id);
                  setEditingId(null);
                }}
                className="min-h-6 inline-flex items-center gap-1 rounded bg-sp-accent text-sp-accent-fg px-2 py-1 text-xs hover:bg-sp-accent/80 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">add</span>새 북마크
              </button>
            </header>
            <div className="space-y-1">
              {isAdding && (
                <BookmarkQuickForm
                  mode="add"
                  groupId={group.id}
                  defaultOrder={(groupBookmarks[groupBookmarks.length - 1]?.order ?? 0) + 1}
                  onSubmit={async (data) => {
                    await addBookmark(data);
                    setAddingInGroup(null);
                  }}
                  onCancel={() => setAddingInGroup(null)}
                />
              )}
              {groupBookmarks.length === 0 && !isAdding && (
                <p className="py-3 text-center text-xs text-sp-muted">비어 있습니다</p>
              )}
              {groupBookmarks.map((b) =>
                editingId === b.id ? (
                  <BookmarkQuickForm
                    key={b.id}
                    mode="edit"
                    bookmark={b}
                    groupId={b.groupId}
                    defaultOrder={b.order}
                    onSubmit={async (data) => {
                      await updateBookmark(b.id, data);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <BookmarkRow
                    key={b.id}
                    bookmark={b}
                    onEdit={() => {
                      setEditingId(b.id);
                      setAddingInGroup(null);
                    }}
                    onDelete={() => handleDelete(b)}
                  />
                ),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/* ─── 북마크 행 (보기 모드) ─── */

interface BookmarkRowProps {
  bookmark: Bookmark;
  onEdit: () => void;
  onDelete: () => void;
}
function BookmarkRow({ bookmark, onEdit, onDelete }: BookmarkRowProps) {
  return (
    <div className="group flex items-center gap-2 rounded-lg border border-transparent hover:border-sp-border/30 hover:bg-sp-bg/40 transition-colors px-2 py-1.5 min-h-6">
      <span className="shrink-0 w-6 h-6 inline-flex items-center justify-center text-base">
        {bookmark.iconType === 'emoji' ? (
          bookmark.iconValue
        ) : (
          <img
            src={bookmark.iconValue}
            alt=""
            className="w-4 h-4"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-sp-text truncate">{bookmark.name}</div>
        <div className="text-xs text-sp-muted truncate">{bookmark.url}</div>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors"
        aria-label="편집"
      >
        <span className="material-symbols-outlined text-sm">edit</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="min-w-6 min-h-6 inline-flex items-center justify-center rounded text-sp-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
        aria-label="삭제"
      >
        <span className="material-symbols-outlined text-sm">delete</span>
      </button>
    </div>
  );
}

/* ─── 빠른 입력 폼 (추가/편집 공용) ─── */

interface BookmarkQuickFormProps {
  mode: 'add' | 'edit';
  bookmark?: Bookmark;
  groupId: string;
  defaultOrder: number;
  onSubmit: (data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  onCancel: () => void;
}
function BookmarkQuickForm({
  mode,
  bookmark,
  groupId,
  defaultOrder,
  onSubmit,
  onCancel,
}: BookmarkQuickFormProps) {
  const [name, setName] = useState(bookmark?.name ?? '');
  const [url, setUrl] = useState(bookmark?.url ?? '');
  const [emoji, setEmoji] = useState(bookmark?.iconType === 'emoji' ? bookmark.iconValue : '🔗');
  const [busy, setBusy] = useState(false);

  const canSubmit = name.trim().length > 0 && url.trim().length > 0 && !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        url: url.trim(),
        type: bookmark?.type ?? 'url',
        iconType: 'emoji',
        iconValue: emoji || '🔗',
        groupId,
        order: defaultOrder,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-sp-accent/40 bg-sp-bg/60 p-2 space-y-1.5">
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
          placeholder="🔗"
          className="w-12 min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1.5 text-sm text-sp-text text-center focus:outline-none focus:border-sp-accent transition-colors"
          aria-label="이모지"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSubmit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="제목"
          autoFocus
          className="flex-1 min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1.5 text-sm text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
        />
      </div>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSubmit();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="URL (https://...)"
        className="w-full min-h-6 rounded bg-sp-card border border-sp-border px-2 py-1.5 text-xs text-sp-text focus:outline-none focus:border-sp-accent transition-colors"
      />
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-6 px-2 py-1 text-xs rounded text-sp-muted hover:text-sp-text hover:bg-sp-surface/50 transition-colors disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className="min-h-6 px-3 py-1 text-xs rounded bg-sp-accent text-sp-accent-fg hover:bg-sp-accent/80 disabled:opacity-40 transition-colors"
        >
          {mode === 'add' ? '추가' : '저장'}
        </button>
      </div>
    </div>
  );
}

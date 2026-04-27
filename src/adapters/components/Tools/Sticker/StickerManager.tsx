import { useCallback, useMemo, useState } from 'react';
import type { Sticker } from '@domain/entities/Sticker';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { searchStickers } from '@domain/rules/stickerRules';
import { StickerThumbnail } from '@adapters/components/StickerPicker/StickerThumbnail';
import { StickerSearchBar } from '@adapters/components/StickerPicker/StickerSearchBar';
import { StickerUploader } from './StickerUploader';
import { StickerSheetSplitter } from './StickerSheetSplitter';
import { StickerEditor } from './StickerEditor';
import { StickerPackManager } from './StickerPackManager';
import { StickerSettingsModal } from './StickerSettingsModal';
import {
  StickerAddPickerModal,
  type StickerAddMode,
} from './StickerAddPickerModal';

type SortKey = 'created' | 'recent' | 'most-used' | 'name';
type ScopeFilter = 'all' | string; // string = packId

interface StickerManagerProps {
  /** 0개일 때 가이드로 자동 전환할지 결정하기 위한 외부 핸들 */
  onSwitchToGuide?: () => void;
}

const SORT_LABELS: Record<SortKey, string> = {
  created: '최신순',
  recent: '최근 사용순',
  'most-used': '자주 사용순',
  name: '이름순',
};

/**
 * 이모티콘 관리 뷰.
 *
 * 레이아웃:
 *   [팩 탭바  ··········  + 이모티콘 추가  ⚙ 설정  📁 팩 관리]
 *   [검색바  정렬 셀렉터]
 *   [그리드 96px × 5~8열]
 */
export function StickerManager({ onSwitchToGuide }: StickerManagerProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const loaded = useStickerStore((s) => s.loaded);

  const [scope, setScope] = useState<ScopeFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('created');
  const [query, setQuery] = useState('');
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [uploaderOpen, setUploaderOpen] = useState(false);
  const [splitterOpen, setSplitterOpen] = useState(false);
  const [editing, setEditing] = useState<Sticker | null>(null);
  const [packsOpen, setPacksOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  /** "+ 이모티콘 추가" 진입 — 선택 모달을 띄운다 */
  const openAddPicker = useCallback(() => {
    setAddPickerOpen(true);
  }, []);

  /** 선택 모달에서 모드 결정 시 본 모달을 닫고 해당 작업 모달 오픈 */
  const handlePickAddMode = useCallback((mode: StickerAddMode) => {
    setAddPickerOpen(false);
    if (mode === 'individual') {
      setUploaderOpen(true);
    } else {
      setSplitterOpen(true);
    }
  }, []);

  const sortedPacks = useMemo(
    () => [...data.packs].sort((a, b) => a.order - b.order),
    [data.packs],
  );

  const filtered = useMemo<Sticker[]>(() => {
    let list = data.stickers as Sticker[];
    if (scope !== 'all') {
      list = list.filter((s) => s.packId === scope);
    }
    if (query.trim().length > 0) {
      list = searchStickers(list, query);
    }
    // 정렬
    const sorted = [...list];
    switch (sortKey) {
      case 'recent':
        sorted.sort((a, b) => {
          if (!a.lastUsedAt && !b.lastUsedAt) return 0;
          if (!a.lastUsedAt) return 1;
          if (!b.lastUsedAt) return -1;
          return b.lastUsedAt.localeCompare(a.lastUsedAt);
        });
        break;
      case 'most-used':
        sorted.sort((a, b) => b.usageCount - a.usageCount);
        break;
      case 'name':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
        break;
      case 'created':
      default:
        sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return sorted;
  }, [data.stickers, scope, query, sortKey]);

  const totalCount = data.stickers.length;
  const isFullyEmpty = loaded && totalCount === 0;

  // 페이지 전체 드래그앤드롭 (uploader 열기 + 파일 전달은 별도 — MVP에서는 모달만 오픈)
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      setDragActive(true);
    }
  }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) {
      setDragActive(false);
    }
  }, []);
  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length > 0) {
      // 페이지에 직접 떨어뜨리면 개별 파일 업로더로 바로 진입
      // (시트 분할은 별도 단계가 필요하므로 모드 선택 모달 우회)
      setUploaderOpen(true);
    }
  }, []);

  if (!loaded) {
    return (
      <div className="flex-1 flex items-center justify-center text-sp-muted">
        <span className="material-symbols-outlined icon-xl animate-pulse mr-2">
          hourglass_empty
        </span>
        <span>이모티콘 불러오는 중...</span>
      </div>
    );
  }

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex flex-col h-full"
    >
      {/* 드래그 오버레이 */}
      {dragActive && (
        <div
          className="absolute inset-0 z-30 rounded-2xl border-2 border-dashed border-sp-accent bg-sp-accent/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          <div className="text-center text-sp-accent">
            <span className="material-symbols-outlined text-icon-xl">cloud_upload</span>
            <p className="mt-2 text-base font-sp-bold">여기에 이미지를 놓아주세요</p>
          </div>
        </div>
      )}

      {/* 빈 상태 (전체 0개) */}
      {isFullyEmpty ? (
        <ManagerEmptyState
          onAddClick={openAddPicker}
          onGuideClick={onSwitchToGuide}
        />
      ) : (
        <>
          {/* 상단 툴바 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {/* 팩 탭 */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 mr-auto">
              <ScopeTab
                label="전체"
                count={totalCount}
                active={scope === 'all'}
                onClick={() => setScope('all')}
              />
              {sortedPacks.map((pack) => {
                const count = data.stickers.filter((s) => s.packId === pack.id).length;
                return (
                  <ScopeTab
                    key={pack.id}
                    label={pack.name}
                    count={count}
                    active={scope === pack.id}
                    onClick={() => setScope(pack.id)}
                  />
                );
              })}
            </div>

            {/* 액션 버튼 */}
            <button
              type="button"
              onClick={() => setPacksOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors"
              title="팩 관리"
            >
              <span className="material-symbols-outlined icon-sm">folder_managed</span>
              팩 관리
            </button>

            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              aria-label="설정"
              title="설정"
              className="p-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors"
            >
              <span className="material-symbols-outlined icon-md">tune</span>
            </button>

            <button
              type="button"
              onClick={openAddPicker}
              title="개별 파일 업로드 또는 시트 분할 중 골라서 등록"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined icon-sm">add</span>
              이모티콘 추가
            </button>
          </div>

          {/* 검색 + 정렬 */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <StickerSearchBar
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              resultCount={filtered.length}
              hasQuery={query.trim().length > 0}
              className="max-w-md"
            />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="정렬"
              className="px-3 py-2.5 rounded-lg bg-sp-bg ring-1 ring-sp-border text-sp-text text-sm focus:outline-none focus:ring-2 focus:ring-sp-accent"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </div>

          {/* 그리드 */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <ManagerNoResults query={query} scope={scope} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 -mr-1">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3">
                {/* + 추가 카드 */}
                <button
                  type="button"
                  onClick={openAddPicker}
                  className="aspect-square rounded-xl border-2 border-dashed border-sp-border bg-sp-bg/20 flex flex-col items-center justify-center gap-1.5 text-sp-muted hover:text-sp-accent hover:border-sp-accent hover:bg-sp-accent/5 transition-all duration-sp-base ease-sp-out group"
                >
                  <span className="material-symbols-outlined text-icon-xl group-hover:scale-110 transition-transform">
                    add
                  </span>
                  <span className="text-detail font-sp-semibold">새 이모티콘</span>
                </button>

                {filtered.map((sticker) => (
                  <ManagerCard
                    key={sticker.id}
                    sticker={sticker}
                    onClick={() => setEditing(sticker)}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 모달들 */}
      <StickerAddPickerModal
        isOpen={addPickerOpen}
        onClose={() => setAddPickerOpen(false)}
        onSelect={handlePickAddMode}
        onOpenGuide={isFullyEmpty ? onSwitchToGuide : undefined}
      />
      <StickerUploader
        isOpen={uploaderOpen}
        onClose={() => setUploaderOpen(false)}
        defaultPackId={scope !== 'all' ? scope : DEFAULT_PACK_ID}
      />
      <StickerSheetSplitter
        isOpen={splitterOpen}
        onClose={() => setSplitterOpen(false)}
        defaultPackId={scope !== 'all' ? scope : DEFAULT_PACK_ID}
      />
      <StickerEditor
        isOpen={!!editing}
        sticker={editing}
        onClose={() => setEditing(null)}
      />
      <StickerPackManager isOpen={packsOpen} onClose={() => setPacksOpen(false)} />
      <StickerSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────────────────────

interface ScopeTabProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function ScopeTab({ label, count, active, onClick }: ScopeTabProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all duration-sp-base ease-sp-out',
        active
          ? 'bg-sp-accent/15 text-sp-accent ring-1 ring-sp-accent/30 font-sp-semibold'
          : 'text-sp-muted hover:text-sp-text hover:bg-sp-text/5 font-sp-medium',
      ].join(' ')}
    >
      <span>{label}</span>
      <span
        className={[
          'text-detail tabular-nums',
          active ? 'text-sp-accent/80' : 'text-sp-muted/70',
        ].join(' ')}
      >
        {count}
      </span>
    </button>
  );
}

interface ManagerCardProps {
  sticker: Sticker;
  onClick: () => void;
}

function ManagerCard({ sticker, onClick }: ManagerCardProps): JSX.Element {
  return (
    <div className="group relative">
      <StickerThumbnail
        sticker={sticker}
        size={108}
        focused={false}
        onClick={onClick}
        className="w-full !h-auto aspect-square"
      />
      <div className="mt-1.5 px-1">
        <p className="text-xs text-sp-text truncate font-sp-medium">{sticker.name}</p>
        {sticker.usageCount > 0 && (
          <p className="text-detail text-sp-muted truncate">
            {sticker.usageCount}회 사용
          </p>
        )}
      </div>
      {/* 호버 시 편집 아이콘 (시각 강화) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
        aria-label={`${sticker.name} 편집`}
        className="absolute top-1 right-1 p-1 rounded-md bg-sp-card/80 text-sp-muted opacity-0 group-hover:opacity-100 hover:text-sp-text hover:bg-sp-card transition-all backdrop-blur-sm"
      >
        <span className="material-symbols-outlined icon-sm">edit</span>
      </button>
    </div>
  );
}

interface ManagerEmptyStateProps {
  onAddClick: () => void;
  onGuideClick?: () => void;
}

function ManagerEmptyState({
  onAddClick,
  onGuideClick,
}: ManagerEmptyStateProps): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center px-8">
      <div className="max-w-md text-center">
        <div className="text-7xl mb-4 select-none" aria-hidden="true">
          😎
        </div>
        <h2 className="text-xl font-sp-bold text-sp-text">
          나만의 이모티콘을 만들어볼까요?
        </h2>
        <p className="text-sp-muted mt-2 leading-relaxed">
          AI로 만든 이미지나 좋아하는 사진을 등록하면<br />
          <span className="font-mono text-sp-accent bg-sp-accent/10 px-1.5 py-0.5 rounded">
            Ctrl + Shift + E
          </span>{' '}
          어디서든 꺼내 쓸 수 있어요.
        </p>

        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onAddClick}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-sp-semibold hover:bg-sp-accent/90 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined icon-sm">add</span>
            첫 이모티콘 추가
          </button>
          {onGuideClick && (
            <button
              type="button"
              onClick={onGuideClick}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-sm font-sp-semibold transition-colors"
            >
              <span className="material-symbols-outlined icon-sm">tips_and_updates</span>
              만드는 법 보기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface ManagerNoResultsProps {
  query: string;
  scope: ScopeFilter;
}

function ManagerNoResults({ query }: ManagerNoResultsProps): JSX.Element {
  if (query.trim().length > 0) {
    return (
      <div className="text-center text-sp-muted">
        <span className="material-symbols-outlined text-icon-xl">search_off</span>
        <p className="mt-2 text-sm">
          <span className="text-sp-text">{`"${query}"`}</span>에 대한 결과가 없어요
        </p>
        <p className="mt-1 text-detail">다른 키워드를 입력해보세요</p>
      </div>
    );
  }
  return (
    <div className="text-center text-sp-muted">
      <span className="material-symbols-outlined text-icon-xl">folder_open</span>
      <p className="mt-2 text-sm">이 팩에는 아직 이모티콘이 없어요</p>
    </div>
  );
}

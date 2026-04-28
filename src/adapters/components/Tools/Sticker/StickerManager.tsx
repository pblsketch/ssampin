import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Sticker } from '@domain/entities/Sticker';
import { DEFAULT_PACK_ID } from '@domain/entities/Sticker';
import { useStickerStore } from '@adapters/stores/useStickerStore';
import { searchStickers } from '@domain/rules/stickerRules';
import { StickerThumbnail } from '@adapters/components/StickerPicker/StickerThumbnail';
import { StickerSearchBar } from '@adapters/components/StickerPicker/StickerSearchBar';
import { Modal } from '@adapters/components/common/Modal';
import { useToastStore } from '@adapters/components/common/Toast';
import { invalidateStickerImage } from '@adapters/components/StickerPicker/useStickerImage';
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
 *
 * 선택 모드:
 *   - 툴바 "선택" 버튼으로 진입
 *   - 카드 클릭 시 체크박스 토글 (편집 모달 비활성)
 *   - 액션바: 전체선택 · ZIP 내보내기 · 다중 삭제 · 취소
 */
export function StickerManager({ onSwitchToGuide }: StickerManagerProps): JSX.Element {
  const data = useStickerStore((s) => s.data);
  const loaded = useStickerStore((s) => s.loaded);
  const deleteSticker = useStickerStore((s) => s.deleteSticker);

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

  // ── 선택 모드 상태 ──
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // ── 선택 모드 헬퍼 ──
  const enterSelectionMode = useCallback(() => {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 데이터에서 사라진 id는 자동 정리 (다른 곳에서 삭제된 경우 대비)
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const valid = new Set(data.stickers.map((s) => s.id));
    let dirty = false;
    const next = new Set<string>();
    selectedIds.forEach((id) => {
      if (valid.has(id)) next.add(id);
      else dirty = true;
    });
    if (dirty) setSelectedIds(next);
  }, [data.stickers, selectedIds]);

  // 현재 보이는 결과(filtered) 기준 전체 선택/해제
  const visibleAllSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.has(s.id));
  const visibleSomeSelected =
    !visibleAllSelected && filtered.some((s) => selectedIds.has(s.id));

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (filtered.every((s) => next.has(s.id))) {
        // 전부 선택돼 있으면 보이는 항목만 해제
        filtered.forEach((s) => next.delete(s.id));
      } else {
        filtered.forEach((s) => next.add(s.id));
      }
      return next;
    });
  }, [filtered]);

  const selectedCount = selectedIds.size;

  // ── 선택된 항목 다중 삭제 ──
  const handleConfirmBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          await window.electronAPI?.sticker?.deleteImage(id).catch(() => {
            // PNG 파일 삭제 실패는 metadata 삭제는 진행
          });
          invalidateStickerImage(id);
          await deleteSticker(id);
        } catch {
          failed += 1;
        }
      }
      const ok = ids.length - failed;
      if (failed === 0) {
        useToastStore.getState().show(`${ok}개 이모티콘을 삭제했어요.`, 'success');
      } else {
        useToastStore
          .getState()
          .show(`${ok}개 삭제 완료 · ${failed}개는 삭제하지 못했어요.`, 'info');
      }
      exitSelectionMode();
    } finally {
      setBulkDeleting(false);
      setBulkDeleteOpen(false);
    }
  }, [selectedIds, deleteSticker, exitSelectionMode]);

  // ── 선택된 항목 ZIP 내보내기 ──
  const handleExportSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const exportZip = window.electronAPI?.sticker?.exportZip;
    if (typeof exportZip !== 'function') {
      useToastStore
        .getState()
        .show('이 환경에서는 내보내기가 지원되지 않아요.', 'info');
      return;
    }
    setExporting(true);
    try {
      // 현재 데이터에서 선택된 sticker만 추출 (이름 매핑)
      const items = data.stickers
        .filter((s) => selectedIds.has(s.id))
        .map((s) => ({
          stickerId: s.id,
          filename: `${s.name}.png`,
        }));
      const result = await exportZip(items);
      if (result.canceled) {
        return;
      }
      const missingMsg =
        result.missing && result.missing > 0
          ? ` (이미지 누락 ${result.missing}개 제외)`
          : '';
      useToastStore
        .getState()
        .show(
          `${result.count ?? items.length}개 이모티콘을 ZIP으로 저장했어요.${missingMsg}`,
          'success',
        );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : '내보내기 중 오류가 발생했어요.';
      useToastStore.getState().show(message, 'error');
    } finally {
      setExporting(false);
    }
  }, [selectedIds, data.stickers]);

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
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      // 선택 모드에서는 의도치 않은 업로드 모달 진입 차단
      if (selectionMode) return;
      if (e.dataTransfer.files.length > 0) {
        setUploaderOpen(true);
      }
    },
    [selectionMode],
  );

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
      {dragActive && !selectionMode && (
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
          {/* 상단 툴바 — 선택 모드 ON/OFF에 따라 분기 */}
          {selectionMode ? (
            <SelectionActionBar
              selectedCount={selectedCount}
              visibleCount={filtered.length}
              visibleAllSelected={visibleAllSelected}
              visibleSomeSelected={visibleSomeSelected}
              onToggleSelectAllVisible={toggleSelectAllVisible}
              onClearSelection={() => setSelectedIds(new Set())}
              onExport={() => void handleExportSelected()}
              onDelete={() => setBulkDeleteOpen(true)}
              onCancel={exitSelectionMode}
              exporting={exporting}
            />
          ) : (
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
                onClick={enterSelectionMode}
                title="여러 이모티콘 선택해서 내보내기 또는 삭제"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg ring-1 ring-sp-border text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors"
              >
                <span className="material-symbols-outlined icon-sm">check_box</span>
                선택
              </button>

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
          )}

          {/* 검색 + 정렬 — 선택 모드에서도 활성 */}
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

          {/* 선택 모드 시 팩 탭바를 보조 위치로 이동 — 필터링 가능 */}
          {selectionMode && (
            <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-3">
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
          )}

          {/* 그리드 */}
          {filtered.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <ManagerNoResults query={query} scope={scope} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pr-1 -mr-1">
              <div className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-3">
                {/* + 추가 카드 — 선택 모드에서는 숨김 */}
                {!selectionMode && (
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
                )}

                {filtered.map((sticker) => (
                  <ManagerCard
                    key={sticker.id}
                    sticker={sticker}
                    selectionMode={selectionMode}
                    selected={selectedIds.has(sticker.id)}
                    onPrimaryAction={() => {
                      if (selectionMode) {
                        toggleSelected(sticker.id);
                      } else {
                        setEditing(sticker);
                      }
                    }}
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

      {/* 다중 삭제 확인 모달 */}
      <BulkDeleteConfirmModal
        isOpen={bulkDeleteOpen}
        count={selectedCount}
        submitting={bulkDeleting}
        onConfirm={() => void handleConfirmBulkDelete()}
        onClose={() => {
          if (!bulkDeleting) setBulkDeleteOpen(false);
        }}
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

interface SelectionActionBarProps {
  selectedCount: number;
  visibleCount: number;
  visibleAllSelected: boolean;
  visibleSomeSelected: boolean;
  onToggleSelectAllVisible: () => void;
  onClearSelection: () => void;
  onExport: () => void;
  onDelete: () => void;
  onCancel: () => void;
  exporting: boolean;
}

function SelectionActionBar({
  selectedCount,
  visibleCount,
  visibleAllSelected,
  visibleSomeSelected,
  onToggleSelectAllVisible,
  onClearSelection,
  onExport,
  onDelete,
  onCancel,
  exporting,
}: SelectionActionBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 px-3 py-2.5 rounded-xl bg-sp-accent/10 ring-1 ring-sp-accent/30">
      {/* 좌측: 전체 선택 체크박스 + 카운트 */}
      <div className="flex items-center gap-3 mr-auto">
        <button
          type="button"
          role="checkbox"
          aria-checked={
            visibleAllSelected
              ? 'true'
              : visibleSomeSelected
                ? 'mixed'
                : 'false'
          }
          onClick={onToggleSelectAllVisible}
          disabled={visibleCount === 0}
          className="inline-flex items-center gap-2 text-sm text-sp-text hover:text-sp-accent transition-colors disabled:opacity-50"
        >
          <span
            className={[
              'inline-flex items-center justify-center w-5 h-5 rounded ring-1',
              visibleAllSelected
                ? 'bg-sp-accent ring-sp-accent text-sp-accent-fg'
                : visibleSomeSelected
                  ? 'bg-sp-accent/40 ring-sp-accent text-sp-accent-fg'
                  : 'bg-sp-bg ring-sp-border',
            ].join(' ')}
            aria-hidden="true"
          >
            {visibleAllSelected && (
              <span className="material-symbols-outlined icon-sm">check</span>
            )}
            {visibleSomeSelected && !visibleAllSelected && (
              <span className="material-symbols-outlined icon-sm">remove</span>
            )}
          </span>
          <span className="font-sp-semibold">
            {visibleAllSelected ? '전체 해제' : '현재 보이는 항목 모두 선택'}
          </span>
        </button>

        <span className="text-sm text-sp-muted">
          <span className="font-sp-bold text-sp-accent tabular-nums">
            {selectedCount}
          </span>
          개 선택됨
        </span>

        {selectedCount > 0 && (
          <button
            type="button"
            onClick={onClearSelection}
            className="text-detail text-sp-muted hover:text-sp-text underline-offset-2 hover:underline transition-colors"
          >
            선택 해제
          </button>
        )}
      </div>

      {/* 우측: 액션 */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onExport}
          disabled={selectedCount === 0 || exporting}
          title="선택한 이모티콘을 ZIP 한 파일로 저장"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg ring-1 ring-sp-border bg-sp-bg/40 text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined icon-sm">
            {exporting ? 'hourglass_top' : 'download'}
          </span>
          {exporting ? '내보내는 중…' : `ZIP 내보내기${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
        </button>

        <button
          type="button"
          onClick={onDelete}
          disabled={selectedCount === 0}
          title="선택한 이모티콘을 영구 삭제"
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg ring-1 ring-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20 text-xs font-sp-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined icon-sm">delete</span>
          삭제{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </button>

        <button
          type="button"
          onClick={onCancel}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sp-muted hover:text-sp-text hover:bg-sp-text/5 text-xs font-sp-semibold transition-colors disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  );
}

interface ManagerCardProps {
  sticker: Sticker;
  selectionMode: boolean;
  selected: boolean;
  onPrimaryAction: () => void;
}

function ManagerCard({
  sticker,
  selectionMode,
  selected,
  onPrimaryAction,
}: ManagerCardProps): JSX.Element {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onPrimaryAction}
        aria-pressed={selectionMode ? selected : undefined}
        aria-label={
          selectionMode
            ? `${sticker.name} ${selected ? '선택 해제' : '선택'}`
            : `${sticker.name} 편집`
        }
        className={[
          'block w-full rounded-xl transition-all duration-sp-base ease-sp-out',
          selectionMode && selected
            ? 'ring-2 ring-sp-accent ring-offset-2 ring-offset-sp-bg'
            : '',
        ].join(' ')}
      >
        <StickerThumbnail
          sticker={sticker}
          size={108}
          focused={false}
          className={[
            'w-full !h-auto aspect-square pointer-events-none',
            selectionMode && selected ? 'opacity-90' : '',
          ].join(' ')}
        />
      </button>

      {/* 선택 체크박스 (선택 모드일 때만 표시) */}
      {selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction();
          }}
          aria-label={selected ? `${sticker.name} 선택 해제` : `${sticker.name} 선택`}
          className={[
            'absolute top-1.5 left-1.5 inline-flex items-center justify-center w-6 h-6 rounded-md ring-1 transition-colors',
            selected
              ? 'bg-sp-accent ring-sp-accent text-sp-accent-fg'
              : 'bg-sp-card/80 ring-sp-border text-transparent hover:ring-sp-accent backdrop-blur-sm',
          ].join(' ')}
        >
          <span className="material-symbols-outlined icon-sm">check</span>
        </button>
      )}

      <div className="mt-1.5 px-1">
        <p className="text-xs text-sp-text truncate font-sp-medium">{sticker.name}</p>
        {sticker.usageCount > 0 && (
          <p className="text-detail text-sp-muted truncate">
            {sticker.usageCount}회 사용
          </p>
        )}
      </div>

      {/* 호버 시 편집 아이콘 — 일반 모드에서만 노출 */}
      {!selectionMode && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPrimaryAction();
          }}
          aria-label={`${sticker.name} 편집`}
          className="absolute top-1 right-1 p-1 rounded-md bg-sp-card/80 text-sp-muted opacity-0 group-hover:opacity-100 hover:text-sp-text hover:bg-sp-card transition-all backdrop-blur-sm"
        >
          <span className="material-symbols-outlined icon-sm">edit</span>
        </button>
      )}
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

// ────────────────────────────────────────────────────────────
// 다중 삭제 확인 모달
// ────────────────────────────────────────────────────────────

interface BulkDeleteConfirmModalProps {
  isOpen: boolean;
  count: number;
  submitting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

function BulkDeleteConfirmModal({
  isOpen,
  count,
  submitting,
  onConfirm,
  onClose,
}: BulkDeleteConfirmModalProps): JSX.Element {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${count}개 이모티콘 삭제`}
      srOnlyTitle
      size="sm"
      closeOnBackdrop={!submitting}
      closeOnEsc={!submitting}
    >
      <div className="flex flex-col">
        <header className="flex items-center justify-between px-5 py-4 border-b border-sp-border">
          <h3 className="text-base font-sp-bold text-sp-text flex items-center gap-2">
            <span className="material-symbols-outlined icon-md text-red-400">
              warning
            </span>
            선택한 이모티콘 삭제
          </h3>
        </header>

        <div className="px-5 py-5">
          <p className="text-sm text-sp-text leading-relaxed">
            선택한{' '}
            <span className="font-sp-bold text-red-300 tabular-nums">{count}개</span>의
            이모티콘을 정말 삭제하시겠어요?
          </p>
          <p className="mt-2 text-detail text-sp-muted">
            이미지 파일과 사용 기록까지 함께 삭제되며, 되돌릴 수 없어요.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-sp-border bg-sp-bg/30">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm text-sp-muted hover:text-sp-text hover:bg-sp-text/5 transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting || count === 0}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-sp-semibold hover:bg-red-500 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined icon-sm">
              {submitting ? 'hourglass_top' : 'delete'}
            </span>
            {submitting ? '삭제하는 중…' : `${count}개 삭제`}
          </button>
        </footer>
      </div>
    </Modal>
  );
}

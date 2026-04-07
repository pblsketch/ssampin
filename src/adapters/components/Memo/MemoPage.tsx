import { useEffect, useState, useCallback, useRef } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useAnalytics } from '@adapters/hooks/useAnalytics';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import { MemoCard } from './MemoCard';
import { MemoDetailPopup } from './MemoDetailPopup';

const COLOR_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

const COLOR_DOT_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

export function MemoPage() {
  const { track } = useAnalytics();
  const { memos, loaded, load, addMemo, deleteMemo, updateMemo, updateColor, arrangeInGrid, archiveMemo, unarchiveMemo } = useMemoStore();
  const [selectedColor, setSelectedColor] = useState<MemoColor>('yellow');
  const [topMemoId, setTopMemoId] = useState<string | null>(null);
  const [detailMemo, setDetailMemo] = useState<Memo | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddMemo = useCallback(() => {
    track('memo_create');
    void addMemo('', selectedColor);
  }, [addMemo, selectedColor, track]);

  // Sync detailMemo with store changes
  useEffect(() => {
    if (detailMemo) {
      const updated = memos.find((m) => m.id === detailMemo.id);
      if (updated) {
        setDetailMemo(updated);
      } else {
        setDetailMemo(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, detailMemo?.id]);

  const handleBringToFront = useCallback((id: string) => {
    setTopMemoId(id);
  }, []);

  const handleOpenDetail = useCallback((memo: Memo) => {
    setDetailMemo(memo);
  }, []);

  const handleCloseDetail = useCallback(() => {
    setDetailMemo(null);
  }, []);

  const handleDetailUpdate = useCallback(
    async (id: string, content: string) => {
      await updateMemo(id, content);
    },
    [updateMemo],
  );

  const handleDetailDelete = useCallback(
    async (id: string) => {
      await deleteMemo(id);
      setDetailMemo(null);
    },
    [deleteMemo],
  );

  const handleDetailColorChange = useCallback(
    async (id: string, color: MemoColor) => {
      await updateColor(id, color);
    },
    [updateColor],
  );

  const handleDetailArchive = useCallback(
    async (id: string) => {
      await archiveMemo(id);
      setDetailMemo(null);
    },
    [archiveMemo],
  );

  const activeMemos = memos.filter((m) => !m.archived);
  const archivedMemos = memos.filter((m) => m.archived);

  if (!loaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sp-muted text-lg">메모 로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col -m-8">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-sp-border bg-sp-surface/80 px-8 backdrop-blur-sm">
        <h2 className="flex items-center gap-2 text-2xl font-black tracking-tight text-sp-text">
          <span className="material-symbols-outlined text-[28px]">sticky_note_2</span>
          나의 메모장
        </h2>
        <div className="flex items-center gap-6">
          {/* Color Picker */}
          {!showArchived && (
            <div className="flex items-center gap-3 rounded-full border border-sp-border bg-sp-card px-4 py-2">
              <span className="mr-1 text-xs font-medium text-sp-muted">색상 선택</span>
              {MEMO_COLORS.map((color) => (
                <button
                  key={color}
                  onClick={() => setSelectedColor(color)}
                  className={`h-6 w-6 rounded-full ${COLOR_BG[color]} ring-2 transition-all hover:scale-110 ${selectedColor === color ? 'ring-white' : 'ring-transparent'
                    }`}
                  aria-label={`${color} 색상 선택`}
                />
              ))}
            </div>
          )}

          {/* Archive Toggle Button */}
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`relative flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all active:scale-95 shadow-sm ${
              showArchived
                ? 'bg-sp-accent border-sp-accent text-white'
                : 'bg-sp-card border-sp-border text-sp-text hover:bg-sp-surface'
            }`}
            title="보관함 보기"
          >
            <span className="material-symbols-outlined text-icon-lg">archive</span>
            보관함
            {archivedMemos.length > 0 && (
              <span className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold ${
                showArchived ? 'bg-white/20 text-white' : 'bg-sp-accent text-white'
              }`}>
                {archivedMemos.length}
              </span>
            )}
          </button>

          {/* Arrange in Grid Button */}
          {!showArchived && (
            <button
              onClick={() => void arrangeInGrid(canvasRef.current?.clientWidth || 800)}
              className="flex items-center gap-2 rounded-lg bg-sp-card border border-sp-border px-4 py-2.5 text-sm font-medium text-sp-text transition-all hover:bg-sp-surface active:scale-95 shadow-sm"
              title="격자로 정렬"
            >
              <span className="material-symbols-outlined text-icon-lg">grid_view</span>
              격자 정렬
            </button>
          )}

          {/* Add Button */}
          {!showArchived && (
            <button
              onClick={handleAddMemo}
              className="flex items-center gap-2 rounded-lg bg-sp-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-95"
            >
              <span className="material-symbols-outlined text-icon-lg">add</span>
              새 메모
            </button>
          )}
        </div>
      </header>

      {showArchived ? (
        /* Archived View */
        <div className="flex-1 overflow-y-auto p-8">
          {archivedMemos.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-24">
              <span className="material-symbols-outlined text-5xl text-sp-muted/30">inventory_2</span>
              <p className="text-sp-muted/50 text-sm">보관된 메모가 없습니다</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {archivedMemos.map((memo) => (
                <div
                  key={memo.id}
                  className="flex flex-col gap-3 rounded-xl border border-sp-border bg-sp-card p-4 shadow-sm"
                >
                  {/* Color indicator + content */}
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${COLOR_DOT_BG[memo.color]}`} />
                    <p className="flex-1 text-sm leading-relaxed text-sp-text line-clamp-4">
                      {memo.content.trim() || <span className="text-sp-muted italic">내용 없음</span>}
                    </p>
                  </div>
                  {/* Date */}
                  <p className="text-xs text-sp-muted">
                    {new Date(memo.updatedAt).toLocaleString('ko-KR')}
                  </p>
                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t border-sp-border pt-3">
                    <button
                      onClick={() => void unarchiveMemo(memo.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-sp-border bg-sp-surface px-3 py-1.5 text-xs font-medium text-sp-text transition-all hover:bg-sp-card active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">unarchive</span>
                      복원
                    </button>
                    <button
                      onClick={() => void deleteMemo(memo.id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-all hover:bg-red-500/20 active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                      영구 삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Canvas Area */
        <div
          ref={canvasRef}
          className="relative flex-1 overflow-auto"
          style={{
            backgroundImage: 'radial-gradient(var(--memo-dot-color, #223149) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {activeMemos.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
              <span className="material-symbols-outlined text-5xl text-sp-muted/30">note_add</span>
              <p className="text-sp-muted/50 text-sm">새 메모를 추가해보세요</p>
            </div>
          )}

          {activeMemos.map((memo) => (
            <MemoCard
              key={memo.id}
              memo={memo}
              isTop={memo.id === topMemoId}
              onBringToFront={handleBringToFront}
              onDelete={deleteMemo}
              onOpenDetail={handleOpenDetail}
              onArchive={archiveMemo}
              canvasRef={canvasRef}
            />
          ))}

          {/* Hint */}
          <p className="pointer-events-none absolute bottom-6 right-6 flex select-none items-center gap-2 text-sm text-sp-muted">
            <span className="material-symbols-outlined text-icon-md">touch_app</span>
            클릭하여 상세보기 · 더블 클릭하여 수정
          </p>
        </div>
      )}

      {detailMemo && (
        <MemoDetailPopup
          memo={detailMemo}
          onClose={handleCloseDetail}
          onUpdate={handleDetailUpdate}
          onDelete={handleDetailDelete}
          onColorChange={handleDetailColorChange}
          onArchive={handleDetailArchive}
        />
      )}
    </div>
  );
}

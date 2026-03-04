import { useEffect, useMemo, useState, useCallback } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { MemoDetailPopup } from '@adapters/components/Memo/MemoDetailPopup';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

const MEMO_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-400/20 border-yellow-400/30',
  pink: 'bg-pink-400/20 border-pink-400/30',
  green: 'bg-green-400/20 border-green-400/30',
  blue: 'bg-blue-400/20 border-blue-400/30',
};

const MEMO_HOVER: Record<MemoColor, string> = {
  yellow: 'hover:bg-yellow-400/30',
  pink: 'hover:bg-pink-400/30',
  green: 'hover:bg-green-400/30',
  blue: 'hover:bg-blue-400/30',
};

const MEMO_TEXT: Record<MemoColor, string> = {
  yellow: 'text-sp-text',
  pink: 'text-sp-text',
  green: 'text-sp-text',
  blue: 'text-sp-text',
};

export function DashboardMemo() {
  const { memos, load, updateMemo, deleteMemo, updateColor } = useMemoStore();
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  // Sync selectedMemo when memos change (e.g. color/content update from Zustand)
  useEffect(() => {
    if (selectedMemo) {
      const updated = memos.find((m) => m.id === selectedMemo.id);
      if (updated) {
        setSelectedMemo(updated);
      } else {
        // memo was deleted
        setSelectedMemo(null);
      }
    }
    // Only depend on selectedMemo?.id to avoid infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, selectedMemo?.id]);

  const recentMemos = useMemo(
    () =>
      [...memos]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3),
    [memos],
  );

  const handleClosePopup = useCallback(() => {
    setSelectedMemo(null);
  }, []);

  const handleUpdate = useCallback(
    async (id: string, content: string) => {
      await updateMemo(id, content);
    },
    [updateMemo],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteMemo(id);
      setSelectedMemo(null);
    },
    [deleteMemo],
  );

  const handleColorChange = useCallback(
    async (id: string, color: MemoColor) => {
      await updateColor(id, color);
    },
    [updateColor],
  );

  return (
    <div className="rounded-xl bg-sp-card p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text">메모</h3>
      </div>

      {recentMemos.length === 0 ? (
        <p className="py-4 text-center text-sm text-sp-muted">메모가 없습니다</p>
      ) : (
        <div className="flex gap-2">
          {recentMemos.map((memo) => (
            <div
              key={memo.id}
              onClick={(e) => { e.stopPropagation(); setSelectedMemo(memo); }}
              className={`rounded-lg border p-3 flex-1 min-w-0 cursor-pointer transition-colors ${MEMO_BG[memo.color]} ${MEMO_HOVER[memo.color]}`}
            >
              <p
                className={`text-xs overflow-hidden ${MEMO_TEXT[memo.color]}`}
                style={{
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}
              >
                {memo.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {selectedMemo && (
        <MemoDetailPopup
          memo={selectedMemo}
          onClose={handleClosePopup}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onColorChange={handleColorChange}
        />
      )}
    </div>
  );
}

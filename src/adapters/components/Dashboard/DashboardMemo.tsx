import { useEffect, useMemo } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

const MEMO_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-400/20 border-yellow-400/30',
  pink: 'bg-pink-400/20 border-pink-400/30',
  green: 'bg-green-400/20 border-green-400/30',
  blue: 'bg-blue-400/20 border-blue-400/30',
};

const MEMO_TEXT: Record<MemoColor, string> = {
  yellow: 'text-sp-text',
  pink: 'text-sp-text',
  green: 'text-sp-text',
  blue: 'text-sp-text',
};

export function DashboardMemo() {
  const { memos, load } = useMemoStore();

  useEffect(() => {
    void load();
  }, [load]);

  const recentMemos = useMemo(
    () =>
      [...memos]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 3),
    [memos],
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
              className={`rounded-lg border p-3 flex-1 min-w-0 ${MEMO_BG[memo.color]}`}
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
    </div>
  );
}

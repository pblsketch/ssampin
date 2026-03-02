import { useEffect, useState, useCallback, useRef } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import { MemoCard } from './MemoCard';

const COLOR_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

export function MemoPage() {
  const { memos, loaded, load, addMemo, deleteMemo, arrangeInGrid } = useMemoStore();
  const [selectedColor, setSelectedColor] = useState<MemoColor>('yellow');
  const [topMemoId, setTopMemoId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddMemo = useCallback(() => {
    void addMemo('', selectedColor);
  }, [addMemo, selectedColor]);

  const handleBringToFront = useCallback((id: string) => {
    setTopMemoId(id);
  }, []);

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
          {/* Arrange in Grid Button */}
          <button
            onClick={() => void arrangeInGrid(canvasRef.current?.clientWidth || 800)}
            className="flex items-center gap-2 rounded-lg bg-sp-card border border-sp-border px-4 py-2.5 text-sm font-medium text-sp-text transition-all hover:bg-slate-700 active:scale-95 shadow-sm"
            title="격자로 정렬"
          >
            <span className="material-symbols-outlined text-[20px]">grid_view</span>
            격자 정렬
          </button>

          {/* Add Button */}
          <button
            onClick={handleAddMemo}
            className="flex items-center gap-2 rounded-lg bg-sp-accent px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-600 active:scale-95"
          >
            <span className="material-symbols-outlined text-[20px]">add</span>
            새 메모
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div
        ref={canvasRef}
        className="relative flex-1 overflow-auto"
        style={{
          backgroundImage: 'radial-gradient(var(--memo-dot-color, #223149) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {memos.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-[48px] text-sp-muted/30">note_add</span>
            <p className="text-sp-muted/50 text-sm">새 메모를 추가해보세요</p>
          </div>
        )}

        {memos.map((memo) => (
          <MemoCard
            key={memo.id}
            memo={memo}
            isTop={memo.id === topMemoId}
            onBringToFront={handleBringToFront}
            onDelete={deleteMemo}
            canvasRef={canvasRef}
          />
        ))}

        {/* Hint */}
        <p className="pointer-events-none absolute bottom-6 right-6 flex select-none items-center gap-2 text-sm text-slate-600">
          <span className="material-symbols-outlined text-[18px]">touch_app</span>
          더블 클릭하여 수정
        </p>
      </div>
    </div>
  );
}

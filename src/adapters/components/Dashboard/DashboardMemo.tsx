import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { useToastStore } from '@adapters/components/common/Toast';
import { MemoDetailPopup } from '@adapters/components/Memo/MemoDetailPopup';
import { MemoEditor } from '@adapters/components/Memo/MemoEditor';
import { MemoFormattedText } from '@adapters/components/Memo/MemoFormattedText';
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

type LayoutMode = 'compact' | 'medium' | 'large' | 'full';

function getLayoutMode(width: number, height: number): LayoutMode {
  if (width >= 600 && height >= 500) return 'full';
  if (width >= 400 && height >= 350) return 'large';
  if (width >= 300 || height >= 250) return 'medium';
  return 'compact';
}

function getLayoutConfig(mode: LayoutMode) {
  switch (mode) {
    case 'full':
      return { count: 9, columns: 3, clamp: 6 };
    case 'large':
      return { count: 6, columns: 2, clamp: 4 };
    case 'medium':
      return { count: 4, columns: 2, clamp: 3 };
    case 'compact':
    default:
      return { count: 3, columns: 3, clamp: 2 };
  }
}

interface DashboardMemoProps {
  /** false일 때(모달 확장 뷰) 전체 메모 팝업 여는 동작만 허용. 기본값 true(카드 뷰) */
  isCompactMode?: boolean;
}

export function DashboardMemo({ isCompactMode = true }: DashboardMemoProps) {
  const { memos, load, addMemo, updateMemo, deleteMemo, updateColor } = useMemoStore();
  const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('compact');

  useEffect(() => {
    void load();
  }, [load]);

  // ResizeObserver로 위젯 크기 감지
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setLayoutMode(getLayoutMode(width, height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Sync selectedMemo when memos change
  useEffect(() => {
    if (selectedMemo) {
      const updated = memos.find((m) => m.id === selectedMemo.id);
      if (updated) {
        setSelectedMemo(updated);
      } else {
        setSelectedMemo(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memos, selectedMemo?.id]);

  const config = getLayoutConfig(layoutMode);

  const recentMemos = useMemo(
    () => [...memos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
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

  const handleQuickAdd = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      const isEnter = e.key === 'Enter';
      const isCmdEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
      if (!isEnter && !isCmdEnter) return;
      e.stopPropagation();
      const text = quickInput.trim();
      if (!text) return;
      setQuickInput('');
      await addMemo(text, 'yellow');
      useToastStore.getState().show(
        '메모 추가됨',
        'success',
        {
          label: '되돌리기',
          onClick: () => {
            const latest = useMemoStore.getState().memos[0];
            if (latest) void deleteMemo(latest.id);
          },
        },
        5000,
      );
    },
    [quickInput, addMemo, deleteMemo],
  );

  const isGrid = layoutMode !== 'compact';

  return (
    <div ref={containerRef} className="rounded-xl bg-sp-card p-4 h-full flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold text-sp-text flex items-center gap-1.5">
          <span>📝</span>메모
        </h3>
        {layoutMode !== 'compact' && (
          <span className="text-xs text-sp-muted">{memos.length}개</span>
        )}
      </div>

      {/* 한 줄 빠른 추가 — 카드/모달 양쪽에서 노출 (widget-expanded-editors Phase 1B) */}
      <input
        type="text"
        placeholder="메모 한 줄 추가… (Enter 또는 Cmd+Enter)"
        value={quickInput}
        onChange={(e) => setQuickInput(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          void handleQuickAdd(e);
        }}
        onClick={(e) => e.stopPropagation()}
        className={`mb-3 min-h-6 w-full rounded-lg bg-sp-surface border border-sp-border px-3 py-1.5 text-sp-text placeholder-sp-muted focus:border-sp-accent focus:outline-none transition-colors hover:border-sp-accent/50 ${
          isCompactMode ? 'text-xs' : 'text-sm py-2'
        }`}
      />

      {/* 본문 — 모달(확장) 모드에서 메모 선택 시 인라인 MemoEditor 로 패널 전환 */}
      {!isCompactMode && selectedMemo ? (
        <div className="flex-1 min-h-0 overflow-hidden">
          <MemoEditor
            memo={selectedMemo}
            onDismiss={handleClosePopup}
            showCloseButton={false}
            showBackToList
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onColorChange={handleColorChange}
          />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-auto">
          {recentMemos.length === 0 ? (
            <p className="py-4 text-center text-sm text-sp-muted">메모가 없습니다</p>
          ) : (
            <div
              className={isGrid ? 'grid gap-3' : 'flex gap-2'}
              style={isGrid ? { gridTemplateColumns: `repeat(${config.columns}, 1fr)` } : undefined}
            >
              {recentMemos.map((memo) => (
                <div
                  key={memo.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedMemo(memo);
                  }}
                  className={`rounded-lg border p-3 cursor-pointer transition-colors min-h-6 ${
                    isGrid ? 'min-h-[60px]' : 'flex-1 min-w-0'
                  } ${MEMO_BG[memo.color]} ${MEMO_HOVER[memo.color]}`}
                >
                  <MemoFormattedText
                    content={memo.content}
                    className={`text-xs overflow-hidden ${MEMO_TEXT[memo.color]}`}
                    style={{
                      display: '-webkit-box',
                      WebkitLineClamp: config.clamp,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* compact 카드 뷰는 기존 MemoDetailPopup(portal) 유지 — 대시보드 위 작은 카드에서 클릭 시 */}
      {isCompactMode && selectedMemo && (
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

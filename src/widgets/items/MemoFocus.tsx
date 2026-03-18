import { useEffect, useMemo, useState, useCallback } from 'react';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { MemoDetailPopup } from '@adapters/components/Memo/MemoDetailPopup';
import { MemoFormattedText } from '@adapters/components/Memo/MemoFormattedText';
import { MemoRichEditor } from '@adapters/components/Memo/MemoRichEditor';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';

const BG_COLOR: Record<MemoColor, string> = {
  yellow: 'bg-yellow-100/30',
  pink: 'bg-pink-100/30',
  green: 'bg-green-100/30',
  blue: 'bg-blue-100/30',
};

const BORDER_COLOR: Record<MemoColor, string> = {
  yellow: 'border-yellow-400/30',
  pink: 'border-pink-400/30',
  green: 'border-green-400/30',
  blue: 'border-blue-400/30',
};

export function MemoFocus() {
  const { memos, load, updateMemo, updateColor, deleteMemo } = useMemoStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailMemo, setDetailMemo] = useState<Memo | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    void load();
  }, [load]);

  const sortedMemos = useMemo(
    () => [...memos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [memos],
  );

  const activeMemo = useMemo(() => {
    if (selectedId) {
      return memos.find((m) => m.id === selectedId) ?? sortedMemos[0] ?? null;
    }
    return sortedMemos[0] ?? null;
  }, [memos, selectedId, sortedMemos]);

  // Sync edit content when active memo changes
  useEffect(() => {
    if (activeMemo) {
      setEditContent(activeMemo.content);
    }
  }, [activeMemo?.id, activeMemo?.content]);

  // Sync detailMemo with store
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

  const handleSave = useCallback(async () => {
    if (activeMemo && editContent !== activeMemo.content) {
      await updateMemo(activeMemo.id, editContent);
    }
    setIsEditing(false);
  }, [activeMemo, editContent, updateMemo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        void handleSave();
      }
    },
    [handleSave],
  );

  const handleClosePopup = useCallback(() => {
    setDetailMemo(null);
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
      setDetailMemo(null);
      if (selectedId === id) {
        setSelectedId(null);
      }
    },
    [deleteMemo, selectedId],
  );

  const handleColorChange = useCallback(
    async (id: string, color: MemoColor) => {
      await updateColor(id, color);
    },
    [updateColor],
  );

  if (memos.length === 0) {
    return (
      <div className="rounded-xl bg-sp-card p-4 h-full flex flex-col items-center justify-center">
        <span className="material-symbols-outlined text-[32px] text-sp-muted/30 mb-2">sticky_note_2</span>
        <p className="text-sm text-sp-muted">메모가 없습니다</p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-sp-card p-4 h-full flex flex-col border ${
      activeMemo ? BORDER_COLOR[activeMemo.color] : ''
    }`}>
      {/* 헤더: 메모 선택 드롭다운 + 편집 토글 */}
      <div className="mb-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-sp-text">메모</h3>
          {sortedMemos.length > 1 && (
            <select
              value={activeMemo?.id ?? ''}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setIsEditing(false);
              }}
              className="rounded-md border border-sp-border bg-sp-surface px-2 py-1 text-xs text-sp-text max-w-[200px] truncate"
            >
              {sortedMemos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.content ? m.content.slice(0, 40).replace(/\n/g, ' ') : '(빈 메모)'}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="flex items-center gap-1">
          {activeMemo && (
            <button
              onClick={() => setDetailMemo(activeMemo)}
              className="rounded-md p-1 text-sp-muted hover:text-sp-text transition-colors"
              title="상세 보기"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
          )}
          <button
            onClick={() => {
              if (isEditing) {
                void handleSave();
              } else {
                setIsEditing(true);
              }
            }}
            className={`rounded-md p-1 transition-colors ${
              isEditing ? 'text-blue-500 hover:text-blue-600' : 'text-sp-muted hover:text-sp-text'
            }`}
            title={isEditing ? '저장' : '편집'}
          >
            <span className="material-symbols-outlined text-[18px]">
              {isEditing ? 'check' : 'edit'}
            </span>
          </button>
        </div>
      </div>

      {/* 콘텐츠: 전체 영역을 꽉 채움 */}
      <div className={`flex-1 min-h-0 overflow-auto rounded-lg p-3 ${
        activeMemo ? BG_COLOR[activeMemo.color] : ''
      }`}>
        {activeMemo && (
          isEditing ? (
            <MemoRichEditor
              initialContent={editContent}
              onContentChange={setEditContent}
              onBlur={() => void handleSave()}
              onKeyDown={handleKeyDown}
              className="w-full h-full text-sm leading-relaxed text-sp-text outline-none"
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={() => setIsEditing(true)}
              className="cursor-text h-full"
            >
              {activeMemo.content ? (
                <MemoFormattedText
                  content={activeMemo.content}
                  className="text-sm leading-relaxed text-sp-text whitespace-pre-wrap"
                />
              ) : (
                <p className="text-sm text-sp-muted">더블 클릭하여 메모를 작성하세요</p>
              )}
            </div>
          )
        )}
      </div>

      {detailMemo && (
        <MemoDetailPopup
          memo={detailMemo}
          onClose={handleClosePopup}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onColorChange={handleColorChange}
        />
      )}
    </div>
  );
}

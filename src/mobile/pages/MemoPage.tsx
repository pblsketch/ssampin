import { useState, useEffect, useRef } from 'react';
import { useMobileMemoStore } from '@mobile/stores/useMobileMemoStore';
import { generateUUID } from '@infrastructure/utils/uuid';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import { DEFAULT_MEMO_FONT_SIZE } from '@domain/valueObjects/MemoFontSize';

interface Props {
  onBack?: () => void;
}

const COLOR_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-200/20',
  pink: 'bg-pink-200/20',
  green: 'bg-green-200/20',
  blue: 'bg-blue-200/20',
};

const COLOR_DOT: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

const COLOR_LABEL: Record<MemoColor, string> = {
  yellow: '노랑',
  pink: '분홍',
  green: '초록',
  blue: '파랑',
};

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return new Date(isoString).toLocaleDateString('ko-KR');
}

interface AddModalProps {
  onClose: () => void;
  onAdd: (content: string, color: MemoColor) => void;
}

function AddModal({ onClose, onAdd }: AddModalProps) {
  const [content, setContent] = useState('');
  const [color, setColor] = useState<MemoColor>('yellow');

  const handleAdd = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onAdd(trimmed, color);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md glass-card rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <h3 className="text-sp-text font-bold text-base">메모 추가</h3>

        <textarea
          className="w-full h-32 glass-input rounded-xl p-3 text-sm resize-none"
          placeholder="메모 내용을 입력하세요..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
        />

        {/* 색상 선택 */}
        <div className="flex items-center gap-3">
          <span className="text-sp-muted text-sm">색상</span>
          <div className="flex gap-2">
            {MEMO_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={COLOR_LABEL[c]}
                className={`w-7 h-7 rounded-full ${COLOR_DOT[c]} transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-offset-sp-surface dark:ring-offset-sp-card ring-sp-accent scale-110' : 'opacity-70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-sp-border text-sp-muted text-sm font-medium"
          >
            취소
          </button>
          <button
            onClick={handleAdd}
            disabled={!content.trim()}
            className="flex-1 py-3 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium disabled:opacity-40"
          >
            추가
          </button>
        </div>
      </div>
    </div>
  );
}

interface EditModalProps {
  memo: Memo;
  onClose: () => void;
  onSave: (id: string, content: string, color: MemoColor) => void;
  onDelete: (id: string) => void;
}

function EditModal({ memo, onClose, onSave, onDelete }: EditModalProps) {
  const [content, setContent] = useState(memo.content);
  const [color, setColor] = useState<MemoColor>(memo.color);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    onSave(memo.id, trimmed, color);
    onClose();
  };

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    onDelete(memo.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md glass-card rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sp-text font-bold text-base">메모 편집</h3>
          <button
            onClick={handleDelete}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              confirmDelete
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'text-sp-muted border border-sp-border'
            }`}
          >
            <span className="material-symbols-outlined text-icon">delete</span>
            {confirmDelete ? '정말 삭제' : '삭제'}
          </button>
        </div>

        <textarea
          className="w-full h-32 glass-input rounded-xl p-3 text-sm resize-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          autoFocus
        />

        {/* 색상 선택 */}
        <div className="flex items-center gap-3">
          <span className="text-sp-muted text-sm">색상</span>
          <div className="flex gap-2">
            {MEMO_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                title={COLOR_LABEL[c]}
                className={`w-7 h-7 rounded-full ${COLOR_DOT[c]} transition-transform ${
                  color === c ? 'ring-2 ring-offset-2 ring-offset-sp-surface dark:ring-offset-sp-card ring-sp-accent scale-110' : 'opacity-70'
                }`}
              />
            ))}
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-sp-border text-sp-muted text-sm font-medium"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!content.trim()}
            className="flex-1 py-3 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium disabled:opacity-40"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}

export function MemoPage({ onBack = undefined }: Props) {
  const { memos, loaded, load, addMemo, updateMemo, deleteMemo } = useMobileMemoStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editingMemo, setEditingMemo] = useState<Memo | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAdd = (content: string, color: MemoColor) => {
    const now = new Date().toISOString();
    void addMemo({
      id: generateUUID(),
      content,
      color,
      x: 0,
      y: 0,
      width: 280,
      height: 220,
      rotation: 0,
      createdAt: now,
      updatedAt: now,
      archived: false,
      fontSize: DEFAULT_MEMO_FONT_SIZE,
    });
  };

  const handleSave = (id: string, content: string, color: MemoColor) => {
    void updateMemo(id, { content, color });
  };

  const handleDelete = (id: string) => {
    void deleteMemo(id);
  };

  const startLongPress = (memo: Memo) => {
    longPressTimer.current = setTimeout(() => {
      setEditingMemo(memo);
    }, 500);
  };

  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <header className="glass-header flex items-center gap-3 px-4 py-3 shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center justify-center w-10 h-10"
          >
            <span className="material-symbols-outlined text-sp-text">arrow_back</span>
          </button>
        )}
        <h2 className="flex-1 text-sp-text font-bold text-base">메모</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-sp-accent/15 text-sp-accent"
        >
          <span className="material-symbols-outlined text-2xl">add</span>
        </button>
      </header>

      {/* 메모 목록 */}
      <div className="flex-1 overflow-y-auto p-4">
        {!loaded ? (
          <div className="flex items-center justify-center h-32">
            <span className="material-symbols-outlined text-sp-muted text-3xl animate-spin">
              progress_activity
            </span>
          </div>
        ) : memos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="material-symbols-outlined text-sp-muted text-4xl">sticky_note_2</span>
            <p className="text-sp-muted text-sm">메모가 없습니다.</p>
            <button
              onClick={() => setShowAdd(true)}
              className="px-4 py-2 rounded-xl bg-sp-accent text-sp-accent-fg text-sm font-medium active:scale-95 transition-transform"
            >
              첫 메모 작성
            </button>
          </div>
        ) : (
          <ul className="space-y-3">
            {[...memos].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((memo) => (
              <li key={memo.id}>
                <div
                  className={`rounded-xl p-4 border border-sp-border ${COLOR_BG[memo.color]} cursor-pointer active:scale-[0.98] transition-transform select-none`}
                  onClick={() => setEditingMemo(memo)}
                  onTouchStart={() => startLongPress(memo)}
                  onTouchEnd={cancelLongPress}
                  onTouchMove={cancelLongPress}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sp-text text-sm leading-relaxed line-clamp-2 flex-1">
                      {memo.content}
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(memo.id);
                      }}
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-lg text-sp-muted hover:text-red-400 transition-colors"
                    >
                      <span className="material-symbols-outlined text-icon-md">delete</span>
                    </button>
                  </div>
                  <p className="text-sp-muted text-xs mt-2">{relativeTime(memo.updatedAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 추가 모달 */}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      )}

      {/* 편집 모달 */}
      {editingMemo && (
        <EditModal
          memo={editingMemo}
          onClose={() => setEditingMemo(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

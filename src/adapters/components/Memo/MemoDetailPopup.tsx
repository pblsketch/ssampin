import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';

const POPUP_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-100',
  pink: 'bg-pink-100',
  green: 'bg-green-100',
  blue: 'bg-blue-100',
};

const COLOR_DOT_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-400',
  pink: 'bg-pink-400',
  green: 'bg-green-400',
  blue: 'bg-blue-400',
};

const COLOR_DOT_RING: Record<MemoColor, string> = {
  yellow: 'ring-yellow-500',
  pink: 'ring-pink-500',
  green: 'ring-green-500',
  blue: 'ring-blue-500',
};

interface MemoDetailPopupProps {
  memo: Memo;
  onClose: () => void;
  onUpdate?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onColorChange?: (id: string, color: MemoColor) => Promise<void>;
}

export function MemoDetailPopup({
  memo,
  onClose,
  onUpdate,
  onDelete,
  onColorChange,
}: MemoDetailPopupProps) {
  const isEmpty = memo.content.trim() === '';
  const [isEditing, setIsEditing] = useState(isEmpty);
  const [editContent, setEditContent] = useState(memo.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const savedContentRef = useRef(memo.content);

  // Sync editContent when memo prop changes (e.g. after color change returns updated memo)
  useEffect(() => {
    setEditContent(memo.content);
    savedContentRef.current = memo.content;
  }, [memo.id, memo.content]);

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.focus();
      ta.selectionStart = ta.value.length;
    }
  }, [isEditing]);

  // Auto-resize textarea
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const ta = textareaRef.current;
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [isEditing, editContent]);

  const saveContent = useCallback(async () => {
    if (editContent !== savedContentRef.current && onUpdate) {
      await onUpdate(memo.id, editContent);
      savedContentRef.current = editContent;
    }
  }, [editContent, memo.id, onUpdate]);

  const handleBlur = useCallback(async () => {
    await saveContent();
    setIsEditing(false);
  }, [saveContent]);

  const handleTextareaKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        await saveContent();
        setIsEditing(false);
      }
    },
    [saveContent],
  );

  // ESC closes the popup (when not editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, onClose]);

  const handleColorChange = useCallback(
    (color: MemoColor) => {
      if (onColorChange) {
        void onColorChange(memo.id, color);
      }
    },
    [memo.id, onColorChange],
  );

  const handleDelete = useCallback(async () => {
    if (onDelete) {
      await onDelete(memo.id);
    }
    onClose();
  }, [memo.id, onDelete, onClose]);

  const handleToggleEdit = useCallback(() => {
    setIsEditing((prev) => !prev);
  }, []);

  const handleOverlayClick = useCallback(() => {
    if (isEditing) {
      void saveContent().then(() => {
        setIsEditing(false);
        onClose();
      });
    } else {
      onClose();
    }
  }, [isEditing, saveContent, onClose]);

  const handleCardClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const updatedLabel = new Date(memo.updatedAt).toLocaleString('ko-KR');

  const popup = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={handleOverlayClick}
    >
      <style>{`
        @keyframes memoPopupIn {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }
        .memo-popup-card {
          animation: memoPopupIn 200ms ease-out forwards;
        }
      `}</style>

      <div
        className={`memo-popup-card flex w-[360px] max-w-[90vw] max-h-[70vh] flex-col rounded-xl shadow-2xl ${POPUP_BG[memo.color]}`}
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          {/* Color dots */}
          <div className="flex items-center gap-2">
            {MEMO_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className={`h-4 w-4 rounded-full transition-transform hover:scale-110 ${COLOR_DOT_BG[color]} ${
                  memo.color === color
                    ? `ring-2 ring-offset-1 ${COLOR_DOT_RING[color]}`
                    : ''
                }`}
                aria-label={`${color} 색상으로 변경`}
              />
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleToggleEdit}
              className={`rounded-md p-1 transition-colors ${
                isEditing
                  ? 'text-blue-600 hover:text-blue-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
              aria-label="편집 모드 전환"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
            </button>
            <button
              onClick={() => void handleDelete()}
              className="rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="메모 삭제"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="닫기"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={() => void handleBlur()}
              onKeyDown={(e) => void handleTextareaKeyDown(e)}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400"
              placeholder="메모를 입력하세요..."
              style={{ minHeight: '120px', overflow: 'hidden' }}
            />
          ) : (
            <div
              className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700"
              style={{ minHeight: '120px' }}
            >
              {memo.content || (
                <span className="text-slate-400">메모 내용이 없습니다</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 border-t border-black/10 px-4 py-2">
          <span className="material-symbols-outlined text-[14px] text-slate-400">
            calendar_today
          </span>
          <span className="text-xs text-slate-500">
            수정됨: {updatedLabel}
          </span>
        </div>
      </div>
    </div>
  );

  return createPortal(popup, document.body);
}

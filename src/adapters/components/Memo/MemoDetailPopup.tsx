import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { MemoFormattedText } from './MemoFormattedText';
import { MemoRichEditor } from './MemoRichEditor';
import { MemoRichToolbarExtras } from './MemoRichToolbarExtras';
import { MemoImageAttachment } from './MemoImageAttachment';
import { MemoImageViewer } from './MemoImageViewer';

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
  onArchive?: (id: string) => Promise<void>;
}

export function MemoDetailPopup({
  memo,
  onClose,
  onUpdate,
  onDelete,
  onColorChange,
  onArchive,
}: MemoDetailPopupProps) {
  const isEmpty = memo.content.trim() === '';
  const [isEditing, setIsEditing] = useState(isEmpty);
  const [editContent, setEditContent] = useState(memo.content);
  const [viewerOpen, setViewerOpen] = useState(false);
  const savedContentRef = useRef(memo.content);

  const { updateFontSize, attachImage, detachImage } = useMemoStore();

  // Sync editContent when memo prop changes (e.g. after color change returns updated memo)
  useEffect(() => {
    setEditContent(memo.content);
    savedContentRef.current = memo.content;
  }, [memo.id, memo.content]);

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

  const handleEditorKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        void saveContent();
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

  const handleArchive = useCallback(async () => {
    if (onArchive) {
      await onArchive(memo.id);
    }
    onClose();
  }, [memo.id, onArchive, onClose]);

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

  const handleFontSizeChange = useCallback(
    (fontSize: MemoFontSize) => {
      void updateFontSize(memo.id, fontSize);
    },
    [memo.id, updateFontSize],
  );

  const handleAttachImage = useCallback(
    async (blob: Blob, fileName: string) => {
      const result = await attachImage(memo.id, blob, fileName);
      if (!result.ok) {
        const msg: Record<'size' | 'mime' | 'decode', string> = {
          size: '이미지는 5MB 이하만 첨부할 수 있습니다.',
          mime: 'PNG, JPEG, WebP만 지원합니다.',
          decode: '이미지 처리에 실패했어요.',
        };
        console.warn(msg[result.reason]);
      }
    },
    [attachImage, memo.id],
  );

  const handleDetachImage = useCallback(() => {
    void detachImage(memo.id);
  }, [detachImage, memo.id]);

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
              <span className="material-symbols-outlined text-icon-md">edit</span>
            </button>
            {onArchive && (
              <button
                onClick={() => void handleArchive()}
                className="rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
                aria-label="보관"
                title="보관"
              >
                <span className="material-symbols-outlined text-icon-md">archive</span>
              </button>
            )}
            <button
              onClick={() => void handleDelete()}
              className="rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="메모 삭제"
            >
              <span className="material-symbols-outlined text-icon-md">delete</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="닫기"
            >
              <span className="material-symbols-outlined text-icon-md">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto pb-2">
          {/* Image thumbnail */}
          {memo.image !== undefined && (
            <div className="px-4 pb-2">
              <MemoImageAttachment
                image={memo.image}
                onOpenViewer={() => setViewerOpen(true)}
                onRemove={isEditing ? handleDetachImage : undefined}
                maxHeight={200}
              />
            </div>
          )}

          <div className="px-4">
            {isEditing ? (
              <MemoRichEditor
                initialContent={editContent}
                onContentChange={setEditContent}
                onBlur={() => void handleBlur()}
                onKeyDown={handleEditorKeyDown}
                fontSize={memo.fontSize}
                onImagePaste={(blob, name) => void handleAttachImage(blob, name)}
                extraToolbarItems={
                  <MemoRichToolbarExtras
                    fontSize={memo.fontSize}
                    onFontSizeChange={handleFontSizeChange}
                    hasImage={memo.image !== undefined}
                    onAttachImage={(blob, name) => void handleAttachImage(blob, name)}
                    onDetachImage={handleDetachImage}
                  />
                }
                className="w-full leading-relaxed text-slate-700 outline-none"
                style={{ minHeight: '120px' }}
                autoFocus
              />
            ) : (
              memo.content ? (
                <MemoFormattedText
                  content={memo.content}
                  fontSize={memo.fontSize}
                  className="leading-relaxed text-slate-700"
                  style={{ minHeight: '120px' }}
                />
              ) : (
                <div
                  className="text-base leading-relaxed text-slate-700"
                  style={{ minHeight: '120px' }}
                >
                  <span className="text-slate-400">메모 내용이 없습니다</span>
                </div>
              )
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-1 border-t border-black/10 px-4 py-2">
          <span className="material-symbols-outlined text-icon-sm text-slate-400">
            calendar_today
          </span>
          <span className="text-xs text-slate-500">
            수정됨: {updatedLabel}
          </span>
        </div>
      </div>

      {/* Image viewer */}
      {viewerOpen && memo.image !== undefined && (
        <MemoImageViewer image={memo.image} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );

  return createPortal(popup, document.body);
}

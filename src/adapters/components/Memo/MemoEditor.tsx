/**
 * MemoEditor — 단일 메모 풀 편집기 본문 (portal/overlay 없음).
 *
 * 기존 MemoDetailPopup의 카드 본체(색상 dot · 액션 버튼 · 컨텐츠 · 푸터)를
 * 그대로 가져온 컴포넌트. portal·overlay·ESC 처리는 호출자 책임.
 *
 * 사용처:
 *  - `MemoDetailPopup.tsx` — portal + overlay + ESC handler 로 감싸 사용 (기존 동작 유지)
 *  - `DashboardMemo.tsx` (widget-expanded-editors Phase 1B) — `isCompactMode=false` 일 때
 *    WidgetModal 내부에서 inline 렌더 (grid → MemoEditor 패널 전환)
 *
 * widget-expanded-editors Plan v0.1 Phase 1B.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { MemoFormattedText } from './MemoFormattedText';
import { MemoRichEditor } from './MemoRichEditor';
import { MemoRichToolbarExtras } from './MemoRichToolbarExtras';
import { MemoImageAttachment } from './MemoImageAttachment';
import { MemoImageViewer } from './MemoImageViewer';

export const POPUP_BG: Record<MemoColor, string> = {
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

export interface MemoEditorProps {
  memo: Memo;
  /** 완료/취소/삭제 등으로 닫혀야 할 때 — 호출자가 의미를 결정 (portal 닫기 OR grid로 복귀) */
  onDismiss: () => void;
  /** ✕ 닫기 버튼 노출 여부. 기본 true. inline 그리드 패널에선 별도 "목록으로" 버튼이 있을 수 있어 false. */
  showCloseButton?: boolean;
  /** "목록으로" 버튼 라벨 노출 — inline 모드 전용. 기본 false. */
  showBackToList?: boolean;
  /** 빈 컨텐츠일 때 자동 편집 모드 시작 여부. 기본 true. */
  autoEditOnEmpty?: boolean;
  onUpdate?: (id: string, content: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onColorChange?: (id: string, color: MemoColor) => Promise<void>;
  onArchive?: (id: string) => Promise<void>;
}

export function MemoEditor({
  memo,
  onDismiss,
  showCloseButton = true,
  showBackToList = false,
  autoEditOnEmpty = true,
  onUpdate,
  onDelete,
  onColorChange,
  onArchive,
}: MemoEditorProps) {
  const isEmpty = memo.content.trim() === '';
  const [isEditing, setIsEditing] = useState(autoEditOnEmpty && isEmpty);
  const [editContent, setEditContent] = useState(memo.content);
  const [viewerOpen, setViewerOpen] = useState(false);
  const savedContentRef = useRef(memo.content);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { updateFontSize, attachImage, detachImage } = useMemoStore();

  // 외부에서 memo prop 변경(색상 변경 후 갱신 등)될 때 editContent 동기화.
  // 단, 같은 메모를 편집 중일 때는 외부 갱신(동기화 리로드 등)으로 입력을 리셋하지 않는다
  // — 편집 종료 시 isEditing=false가 되면서 최신 저장값과 다시 동기화된다.
  const prevMemoIdRef = useRef(memo.id);
  useEffect(() => {
    const idChanged = prevMemoIdRef.current !== memo.id;
    prevMemoIdRef.current = memo.id;
    if (!idChanged && isEditing) return;
    setEditContent(memo.content);
    savedContentRef.current = memo.content;
  }, [memo.id, memo.content, isEditing]);

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
    onDismiss();
  }, [memo.id, onDelete, onDismiss]);

  const handleArchive = useCallback(async () => {
    if (onArchive) {
      await onArchive(memo.id);
    }
    onDismiss();
  }, [memo.id, onArchive, onDismiss]);

  const handleToggleEdit = useCallback(() => {
    setIsEditing((prev) => !prev);
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

  const handleAttachRequest = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file === undefined) return;
      if (!isAllowedMemoImageMime(file.type)) {
        console.warn('PNG, JPEG, WebP만 지원합니다.');
        return;
      }
      await handleAttachImage(file, file.name);
    },
    [handleAttachImage],
  );

  const updatedLabel = new Date(memo.updatedAt).toLocaleString('ko-KR');

  return (
    <div
      className={`flex w-full max-w-[420px] mx-auto h-full max-h-full flex-col rounded-xl shadow-2xl ${POPUP_BG[memo.color]}`}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
        {/* Color dots */}
        <div className="flex items-center gap-2">
          {MEMO_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => handleColorChange(color)}
              className={`h-4 w-4 min-w-6 min-h-6 rounded-full transition-transform hover:scale-110 ${COLOR_DOT_BG[color]} ${
                memo.color === color ? `ring-2 ring-offset-1 ${COLOR_DOT_RING[color]}` : ''
              }`}
              aria-label={`${color} 색상으로 변경`}
            />
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {showBackToList && (
            <button
              type="button"
              onClick={onDismiss}
              className="min-w-6 min-h-6 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-black/5 hover:text-slate-900 transition-colors"
            >
              ← 목록
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleEdit}
            className={`min-w-6 min-h-6 rounded-md p-1 transition-colors ${
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
              type="button"
              onClick={() => void handleArchive()}
              className="min-w-6 min-h-6 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="보관"
              title="보관"
            >
              <span className="material-symbols-outlined text-icon-md">archive</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="min-w-6 min-h-6 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
            aria-label="메모 삭제"
          >
            <span className="material-symbols-outlined text-icon-md">delete</span>
          </button>
          {showCloseButton && (
            <button
              type="button"
              onClick={onDismiss}
              className="min-w-6 min-h-6 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-700"
              aria-label="닫기"
            >
              <span className="material-symbols-outlined text-icon-md">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto pb-2">
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
                  onAttachRequest={handleAttachRequest}
                  onDetachImage={handleDetachImage}
                />
              }
              className="w-full leading-relaxed text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-1 rounded-sm"
              style={{ minHeight: '120px' }}
              autoFocus
            />
          ) : memo.content ? (
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
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-1 border-t border-black/10 px-4 py-2 shrink-0">
        <span className="material-symbols-outlined text-icon-sm text-slate-400">
          calendar_today
        </span>
        <span className="text-xs text-slate-500">수정됨: {updatedLabel}</span>
      </div>

      {/* Hidden file input — 편집 상태와 무관하게 항상 DOM에 존재 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => void handleFileInputChange(e)}
      />

      {/* Image viewer (자식 portal — MemoEditor 외부에 마운트) */}
      {viewerOpen && memo.image !== undefined && (
        <MemoImageViewer image={memo.image} onClose={() => setViewerOpen(false)} />
      )}
    </div>
  );
}

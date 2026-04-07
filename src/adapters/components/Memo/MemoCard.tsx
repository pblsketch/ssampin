import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import { MEMO_SIZE } from '@domain/rules/memoRules';
import { useMemoStore } from '@adapters/stores/useMemoStore';
import { MemoFormattedText } from './MemoFormattedText';
import { MemoRichEditor } from './MemoRichEditor';

const NOTE_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-200',
  pink: 'bg-pink-200',
  green: 'bg-green-200',
  blue: 'bg-blue-200',
};

const DOT_COLOR: Record<MemoColor, string> = {
  yellow: 'bg-yellow-500/40',
  pink: 'bg-pink-500/40',
  green: 'bg-green-500/40',
  blue: 'bg-blue-500/40',
};

const FOLD_BORDER: Record<MemoColor, string> = {
  yellow: 'border-t-yellow-300',
  pink: 'border-t-pink-300',
  green: 'border-t-green-300',
  blue: 'border-t-blue-300',
};

const COLOR_DOT_BG: Record<MemoColor, string> = {
  yellow: 'bg-yellow-300',
  pink: 'bg-pink-300',
  green: 'bg-green-300',
  blue: 'bg-blue-300',
};

interface MemoCardProps {
  memo: Memo;
  isTop: boolean;
  onBringToFront: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenDetail?: (memo: Memo) => void;
  onArchive?: (id: string) => void;
  canvasRef: RefObject<HTMLDivElement | null>;
}

export function MemoCard({ memo, isTop, onBringToFront, onDelete, onOpenDetail, onArchive, canvasRef }: MemoCardProps) {
  const { updateMemo, updatePosition, updateColor, updateSize } = useMemoStore();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memo.content);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [resizeSize, setResizeSize] = useState({ width: memo.width ?? MEMO_SIZE.DEFAULT_WIDTH, height: memo.height ?? MEMO_SIZE.DEFAULT_HEIGHT });
  const cardRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setContent(memo.content);
  }, [memo.content]);

  useEffect(() => {
    setResizeSize({ width: memo.width ?? MEMO_SIZE.DEFAULT_WIDTH, height: memo.height ?? MEMO_SIZE.DEFAULT_HEIGHT });
  }, [memo.width, memo.height]);

  const handleDoubleClick = useCallback(() => {
    // Cancel pending single-click timer (prevents popup from opening)
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    setEditing(true);
    onBringToFront(memo.id);
  }, [memo.id, onBringToFront]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    if (content !== memo.content) {
      void updateMemo(memo.id, content);
    }
  }, [content, memo.content, memo.id, updateMemo]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (content !== memo.content) {
          void updateMemo(memo.id, content);
        }
        setEditing(false);
      }
    },
    [content, memo.content, memo.id, updateMemo],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (editing) return;
      e.preventDefault();
      onBringToFront(memo.id);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const scrollLeft = canvas.scrollLeft;
      const scrollTop = canvas.scrollTop;
      const canvasRect = canvas.getBoundingClientRect();

      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      dragOffset.current = {
        x: e.clientX - canvasRect.left + scrollLeft - memo.x,
        y: e.clientY - canvasRect.top + scrollTop - memo.y,
      };
      setDragging(true);
    },
    [editing, memo.id, memo.x, memo.y, onBringToFront, canvasRef],
  );

  useEffect(() => {
    if (!dragging) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseMove = (e: MouseEvent) => {
      const scrollLeft = canvas.scrollLeft;
      const scrollTop = canvas.scrollTop;
      const canvasRect = canvas.getBoundingClientRect();

      const newX = Math.max(0, e.clientX - canvasRect.left + scrollLeft - dragOffset.current.x);
      const newY = Math.max(0, e.clientY - canvasRect.top + scrollTop - dragOffset.current.y);

      if (cardRef.current) {
        cardRef.current.style.left = `${newX}px`;
        cardRef.current.style.top = `${newY}px`;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      setDragging(false);

      const dx = e.clientX - mouseDownPos.current.x;
      const dy = e.clientY - mouseDownPos.current.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // If moved less than 8px, treat as click (not drag)
      if (distance < 8) {
        // Use a timer to distinguish single click from double click
        if (onOpenDetail) {
          if (clickTimer.current) {
            // Double click — clear timer, let onDoubleClick handle it
            clearTimeout(clickTimer.current);
            clickTimer.current = null;
          } else {
            // Single click — set timer, open detail if not cancelled by double click
            clickTimer.current = setTimeout(() => {
              clickTimer.current = null;
              onOpenDetail(memo);
            }, 300);
          }
        }
        return;
      }

      const scrollLeft = canvas.scrollLeft;
      const scrollTop = canvas.scrollTop;
      const canvasRect = canvas.getBoundingClientRect();

      const finalX = Math.max(0, e.clientX - canvasRect.left + scrollLeft - dragOffset.current.x);
      const finalY = Math.max(0, e.clientY - canvasRect.top + scrollTop - dragOffset.current.y);

      void updatePosition(memo.id, finalX, finalY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, memo.id, updatePosition, canvasRef]);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = memo.width ?? MEMO_SIZE.DEFAULT_WIDTH;
      const startHeight = memo.height ?? MEMO_SIZE.DEFAULT_HEIGHT;

      setResizing(true);

      const handleMouseMove = (ev: MouseEvent) => {
        const newWidth = Math.max(MEMO_SIZE.MIN_WIDTH, Math.min(MEMO_SIZE.MAX_WIDTH, startWidth + (ev.clientX - startX)));
        const newHeight = Math.max(MEMO_SIZE.MIN_HEIGHT, Math.min(MEMO_SIZE.MAX_HEIGHT, startHeight + (ev.clientY - startY)));
        setResizeSize({ width: newWidth, height: newHeight });
      };

      const handleMouseUp = (ev: MouseEvent) => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        setResizing(false);

        const finalWidth = Math.max(MEMO_SIZE.MIN_WIDTH, Math.min(MEMO_SIZE.MAX_WIDTH, startWidth + (ev.clientX - startX)));
        const finalHeight = Math.max(MEMO_SIZE.MIN_HEIGHT, Math.min(MEMO_SIZE.MAX_HEIGHT, startHeight + (ev.clientY - startY)));
        void updateSize(memo.id, finalWidth, finalHeight);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [memo.id, memo.width, memo.height, updateSize],
  );

  const handleColorChange = useCallback(
    (color: MemoColor) => {
      void updateColor(memo.id, color);
    },
    [memo.id, updateColor],
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void onDelete(memo.id);
    },
    [memo.id, onDelete],
  );

  return (
    <div
      ref={cardRef}
      className={`group absolute ${NOTE_BG[memo.color]} rounded-sm text-slate-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06),0_10px_15px_-3px_rgba(0,0,0,0.1)] transition-transform duration-300 ${dragging ? 'scale-105 !rotate-0 cursor-grabbing' : 'cursor-move hover:rotate-0 hover:scale-105'
        }`}
      style={{
        left: memo.x,
        top: memo.y,
        width: resizing ? resizeSize.width : (memo.width ?? MEMO_SIZE.DEFAULT_WIDTH),
        minHeight: resizing ? resizeSize.height : (memo.height ?? MEMO_SIZE.DEFAULT_HEIGHT),
        transform: dragging ? 'scale(1.05) rotate(0deg)' : `rotate(${memo.rotation}deg)`,
        zIndex: isTop ? 20 : 10,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      {/* Paper texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-sm opacity-[0.08]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />

      {/* Header: dots + color changer + delete */}
      <div className="flex h-8 w-full items-center justify-between px-3 pt-2">
        <div className="flex gap-1.5">
          {MEMO_COLORS.map((color) => (
            <button
              key={color}
              onClick={(e) => {
                e.stopPropagation();
                handleColorChange(color);
              }}
              className={`h-2.5 w-2.5 rounded-full ${color === memo.color ? DOT_COLOR[color] : COLOR_DOT_BG[color]
                } opacity-0 transition-opacity group-hover:opacity-100 hover:scale-125`}
              aria-label={`${color} 색상으로 변경`}
            />
          ))}
        </div>
        <div className="flex items-center gap-0.5">
          {onArchive && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onArchive(memo.id);
              }}
              className="text-slate-500 opacity-0 transition-opacity hover:text-slate-900 group-hover:opacity-100"
              title="보관"
            >
              <span className="material-symbols-outlined text-icon-md">archive</span>
            </button>
          )}
          <button
            onClick={handleDelete}
            className="text-slate-500 opacity-0 transition-opacity hover:text-slate-900 group-hover:opacity-100"
          >
            <span className="material-symbols-outlined text-icon-md">close</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-5 pt-1">
        {editing ? (
          <MemoRichEditor
            initialContent={content}
            onContentChange={setContent}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="flex-1 w-full text-sm leading-relaxed text-slate-700 outline-none"
            autoFocus
          />
        ) : (
          memo.content ? (
            <MemoFormattedText
              content={memo.content}
              className="flex-1 text-sm leading-relaxed text-slate-700"
            />
          ) : (
            <div className="flex-1 text-sm leading-relaxed text-slate-700">
              <span className="text-slate-400">더블 클릭하여 메모를 작성하세요</span>
            </div>
          )
        )}
      </div>

      {/* Resize handle (우하단) — 더블클릭으로 기본 크기 복원 */}
      <div
        onMouseDown={handleResizeMouseDown}
        onDoubleClick={(e) => {
          e.stopPropagation();
          void updateSize(memo.id, MEMO_SIZE.DEFAULT_WIDTH, MEMO_SIZE.DEFAULT_HEIGHT);
        }}
        className={`absolute bottom-1 right-5 z-10 cursor-se-resize
          opacity-0 group-hover:opacity-100 transition-opacity
          ${resizing ? '!opacity-100' : ''}`}
        title="드래그: 크기 조절 / 더블클릭: 기본 크기로"
      >
        <span className="material-symbols-outlined text-icon text-slate-400 hover:text-slate-600">
          drag_indicator
        </span>
      </div>

      {/* 리사이즈 중 크기 표시 — 카드 위에 띄움 */}
      {resizing && (
        <div className="absolute -top-8 left-1/2 -translate-x-1/2 z-30 bg-sp-card !text-sp-text text-xs px-2.5 py-1 rounded shadow-lg whitespace-nowrap pointer-events-none">
          {Math.round(resizeSize.width)} &times; {Math.round(resizeSize.height)}
        </div>
      )}

      {/* Fold effect (bottom-right corner) */}
      <div
        className={`absolute bottom-0 right-0 border-r-transparent border-t-[20px] border-r-[20px] opacity-50 shadow-sm ${FOLD_BORDER[memo.color]}`}
      />
    </div>
  );
}

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react';
import type { Memo } from '@domain/entities/Memo';
import type { MemoColor } from '@domain/valueObjects/MemoColor';
import { MEMO_COLORS } from '@domain/valueObjects/MemoColor';
import { useMemoStore } from '@adapters/stores/useMemoStore';

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
  canvasRef: RefObject<HTMLDivElement | null>;
}

export function MemoCard({ memo, isTop, onBringToFront, onDelete, canvasRef }: MemoCardProps) {
  const { updateMemo, updatePosition, updateColor } = useMemoStore();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(memo.content);
  const [dragging, setDragging] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setContent(memo.content);
  }, [memo.content]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleDoubleClick = useCallback(() => {
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
      className={`group absolute w-[280px] min-h-[220px] ${NOTE_BG[memo.color]} rounded-sm text-slate-800 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06),0_10px_15px_-3px_rgba(0,0,0,0.1)] transition-transform duration-300 ${dragging ? 'scale-105 !rotate-0 cursor-grabbing' : 'cursor-move hover:rotate-0 hover:scale-105'
        }`}
      style={{
        left: memo.x,
        top: memo.y,
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
        <button
          onClick={handleDelete}
          className="text-slate-500 opacity-0 transition-opacity hover:text-slate-900 group-hover:opacity-100"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex h-full flex-col gap-2 p-5 pt-1">
        {editing ? (
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className="min-h-[140px] w-full resize-none bg-transparent text-sm leading-relaxed text-slate-700 outline-none placeholder:text-slate-400"
            placeholder="메모를 입력하세요..."
          />
        ) : (
          <div className="min-h-[140px] whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {memo.content || (
              <span className="text-slate-400">더블 클릭하여 메모를 작성하세요</span>
            )}
          </div>
        )}
      </div>

      {/* Fold effect (bottom-right corner) */}
      <div
        className={`absolute bottom-0 right-0 border-r-transparent border-t-[20px] border-r-[20px] opacity-50 shadow-sm ${FOLD_BORDER[memo.color]}`}
      />
    </div>
  );
}

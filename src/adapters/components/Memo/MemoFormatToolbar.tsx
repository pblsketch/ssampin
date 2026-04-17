import { useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import {
  clampFontSizeStep,
  MEMO_FONT_SIZE_LABEL,
  MEMO_FONT_SIZES,
} from '@domain/valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';

interface MemoFormatToolbarProps {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (newContent: string) => void;
  fontSize: MemoFontSize;
  onFontSizeChange: (fontSize: MemoFontSize) => void;
  hasImage: boolean;
  onAttachImage: (blob: Blob, fileName: string) => void;
  onDetachImage: () => void;
}

type FormatMarker = '**' | '__' | '~~';

interface FormatButton {
  marker: FormatMarker;
  icon: string;
  label: string;
}

const FORMAT_BUTTONS: FormatButton[] = [
  { marker: '**', icon: 'format_bold', label: '굵게' },
  { marker: '__', icon: 'format_underlined', label: '밑줄' },
  { marker: '~~', icon: 'format_strikethrough', label: '취소선' },
];

function isWrapped(text: string, marker: string): boolean {
  return text.length >= marker.length * 2
    && text.startsWith(marker)
    && text.endsWith(marker);
}

export function MemoFormatToolbar({
  textareaRef,
  content,
  onContentChange,
  fontSize,
  onFontSizeChange,
  hasImage,
  onAttachImage,
  onDetachImage,
}: MemoFormatToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyFormat = useCallback(
    (marker: FormatMarker) => {
      const ta = textareaRef.current;
      if (!ta) return;

      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const markerLen = marker.length;

      if (start !== end) {
        // Has selection
        const selected = content.substring(start, end);

        if (isWrapped(selected, marker)) {
          // Remove wrapper: **text** → text
          const unwrapped = selected.substring(markerLen, selected.length - markerLen);
          const newContent = content.substring(0, start) + unwrapped + content.substring(end);
          onContentChange(newContent);

          // Restore cursor around unwrapped text
          requestAnimationFrame(() => {
            ta.focus();
            ta.selectionStart = start;
            ta.selectionEnd = start + unwrapped.length;
          });
        } else {
          // Check if selection is already wrapped by outer markers
          const outerStart = start - markerLen;
          const outerEnd = end + markerLen;
          if (
            outerStart >= 0
            && outerEnd <= content.length
            && content.substring(outerStart, start) === marker
            && content.substring(end, outerEnd) === marker
          ) {
            // Remove outer markers
            const newContent = content.substring(0, outerStart) + selected + content.substring(outerEnd);
            onContentChange(newContent);
            requestAnimationFrame(() => {
              ta.focus();
              ta.selectionStart = outerStart;
              ta.selectionEnd = outerStart + selected.length;
            });
          } else {
            // Wrap selection
            const wrapped = marker + selected + marker;
            const newContent = content.substring(0, start) + wrapped + content.substring(end);
            onContentChange(newContent);

            requestAnimationFrame(() => {
              ta.focus();
              ta.selectionStart = start + markerLen;
              ta.selectionEnd = end + markerLen;
            });
          }
        }
      } else {
        // No selection — insert empty markers and place cursor in the middle
        const insert = marker + marker;
        const newContent = content.substring(0, start) + insert + content.substring(start);
        onContentChange(newContent);

        requestAnimationFrame(() => {
          ta.focus();
          ta.selectionStart = start + markerLen;
          ta.selectionEnd = start + markerLen;
        });
      }
    },
    [textareaRef, content, onContentChange],
  );

  const handleButtonMouseDown = useCallback(
    (e: React.MouseEvent, marker: FormatMarker) => {
      // Prevent blur on textarea
      e.preventDefault();
      applyFormat(marker);
    },
    [applyFormat],
  );

  const isAtMin = MEMO_FONT_SIZES.indexOf(fontSize) === 0;
  const isAtMax = MEMO_FONT_SIZES.indexOf(fontSize) === MEMO_FONT_SIZES.length - 1;

  return (
    <div className="flex items-center gap-0.5 pb-1">
      {FORMAT_BUTTONS.map(({ marker, icon, label }) => (
        <button
          key={marker}
          type="button"
          onMouseDown={(e) => handleButtonMouseDown(e, marker)}
          className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text"
          aria-label={label}
          title={label}
        >
          <span className="material-symbols-outlined text-icon-md">{icon}</span>
        </button>
      ))}

      {/* 구분선 */}
      <span className="mx-1 h-5 w-px bg-black/10" />

      {/* 글자 크기 감소 */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFontSizeChange(clampFontSizeStep(fontSize, -1))}
        disabled={isAtMin}
        className={`flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label="글자 크기 줄이기"
        title="글자 크기 줄이기"
      >
        <span className="material-symbols-outlined text-icon-md">text_decrease</span>
      </button>

      {/* 현재 크기 라벨 */}
      <span className="px-1 text-xs text-sp-muted select-none min-w-[3rem] text-center">
        {MEMO_FONT_SIZE_LABEL[fontSize]}
      </span>

      {/* 글자 크기 증가 */}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onFontSizeChange(clampFontSizeStep(fontSize, 1))}
        disabled={isAtMax}
        className={`flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label="글자 크기 늘리기"
        title="글자 크기 늘리기"
      >
        <span className="material-symbols-outlined text-icon-md">text_increase</span>
      </button>

      {/* 구분선 */}
      <span className="mx-1 h-5 w-px bg-black/10" />

      {/* 이미지 첨부/제거 */}
      {hasImage ? (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onDetachImage}
          className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text"
          aria-label="이미지 제거"
          title="이미지 제거"
        >
          <span className="material-symbols-outlined text-icon-md">hide_image</span>
        </button>
      ) : (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
          className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/5 hover:text-sp-text"
          aria-label="이미지 첨부"
          title="이미지 첨부"
        >
          <span className="material-symbols-outlined text-icon-md">add_photo_alternate</span>
        </button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && isAllowedMemoImageMime(file.type)) {
            onAttachImage(file, file.name);
          }
          e.target.value = '';
        }}
      />
    </div>
  );
}

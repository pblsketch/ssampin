import { useCallback } from 'react';

interface MemoFormatToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  content: string;
  onContentChange: (newContent: string) => void;
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

export function MemoFormatToolbar({ textareaRef, content, onContentChange }: MemoFormatToolbarProps) {
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

  return (
    <div className="flex items-center gap-0.5 pb-1">
      {FORMAT_BUTTONS.map(({ marker, icon, label }) => (
        <button
          key={marker}
          type="button"
          onMouseDown={(e) => handleButtonMouseDown(e, marker)}
          className="flex h-7 w-7 items-center justify-center rounded text-slate-500 transition-colors hover:bg-black/5 hover:text-slate-700"
          aria-label={label}
          title={label}
        >
          <span className="material-symbols-outlined text-[18px]">{icon}</span>
        </button>
      ))}
    </div>
  );
}

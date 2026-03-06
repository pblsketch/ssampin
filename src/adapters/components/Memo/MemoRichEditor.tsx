import { useRef, useEffect, useCallback, useState } from 'react';
import { markdownToHtml, htmlToMarkdown } from '@domain/rules/memoRules';

interface MemoRichEditorProps {
  initialContent: string;
  onContentChange: (markdown: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
}

const FORMAT_COMMANDS = [
  { command: 'bold', icon: 'format_bold', label: '굵게' },
  { command: 'underline', icon: 'format_underlined', label: '밑줄' },
  { command: 'strikeThrough', icon: 'format_strikethrough', label: '취소선' },
] as const;

export function MemoRichEditor({
  initialContent,
  onContentChange,
  onBlur,
  onKeyDown,
  className = '',
  placeholder = '메모를 입력하세요...',
  autoFocus = false,
  style,
}: MemoRichEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!initialContent.trim());

  // 초기 마크다운 → HTML 변환 (마운트 시 1회)
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = markdownToHtml(initialContent);
    setIsEmpty(!initialContent.trim());

    if (autoFocus) {
      editorRef.current.focus();
      const sel = window.getSelection();
      if (sel) {
        sel.selectAllChildren(editorRef.current);
        sel.collapseToEnd();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const md = htmlToMarkdown(editorRef.current);
    setIsEmpty(!md.trim());
    onContentChange(md);
  }, [onContentChange]);

  const handleFormat = useCallback(
    (command: string) => {
      document.execCommand(command, false);
      editorRef.current?.focus();
      handleInput();
    },
    [handleInput],
  );

  // 붙여넣기 시 서식 제거 (plain text만)
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  return (
    <>
      {/* 서식 도구 모음 */}
      <div className="mb-1 flex gap-0.5">
        {FORMAT_COMMANDS.map((fmt) => (
          <button
            key={fmt.command}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleFormat(fmt.command);
            }}
            className="rounded p-0.5 text-slate-500 transition-colors hover:bg-black/10 hover:text-slate-700"
            aria-label={fmt.label}
            title={fmt.label}
          >
            <span className="material-symbols-outlined text-[16px]">{fmt.icon}</span>
          </button>
        ))}
      </div>

      {/* 편집 영역 */}
      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute left-0 top-0 select-none text-sm text-slate-400">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          onInput={handleInput}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          className={className}
          style={style}
          suppressContentEditableWarning
        />
      </div>
    </>
  );
}

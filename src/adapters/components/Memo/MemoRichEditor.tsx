import { useRef, useEffect, useCallback, useState } from 'react';
import { markdownToHtml, htmlToMarkdown } from '@domain/rules/memoRules';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { MEMO_FONT_SIZE_CLASS } from '@domain/valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';

interface MemoRichEditorProps {
  initialContent: string;
  onContentChange: (markdown: string) => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  style?: React.CSSProperties;
  fontSize?: MemoFontSize;
  /** 이미지가 클립보드에 있을 때 호출. 지원 포맷만 전달됨. */
  onImagePaste?: (blob: Blob, fileName: string) => void;
  /** 서식 버튼 뒤에 붙는 추가 툴바 아이템 (글자 크기·이미지 도구 등) */
  extraToolbarItems?: React.ReactNode;
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
  fontSize,
  onImagePaste,
  extraToolbarItems,
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

  // 붙여넣기 시 이미지 우선, 텍스트는 서식 제거
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    // 1) 이미지 붙여넣기 체크
    if (onImagePaste !== undefined) {
      const items = e.clipboardData.items;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item !== undefined && item.type.startsWith('image/') && isAllowedMemoImageMime(item.type)) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file !== null) {
            const ext = item.type.split('/')[1] ?? 'png';
            onImagePaste(file, `clipboard-${Date.now()}.${ext}`);
          }
          return;
        }
      }
    }
    // 2) 기존 텍스트 붙여넣기 (서식 제거)
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, [onImagePaste]);

  return (
    <>
      {/* 서식 도구 모음 */}
      <div className="mb-1 flex items-center gap-0.5">
        {FORMAT_COMMANDS.map((fmt) => (
          <button
            key={fmt.command}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              handleFormat(fmt.command);
            }}
            className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text"
            aria-label={fmt.label}
            title={fmt.label}
          >
            <span className="material-symbols-outlined text-icon">{fmt.icon}</span>
          </button>
        ))}
        {extraToolbarItems}
      </div>

      {/* 편집 영역 */}
      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute left-0 top-0 select-none text-sm text-sp-muted/60">
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
          className={`${className} ${MEMO_FONT_SIZE_CLASS[fontSize ?? 'base']}`.trim()}
          style={style}
          suppressContentEditableWarning
        />
      </div>
    </>
  );
}

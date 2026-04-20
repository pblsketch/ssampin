import { useRef, useEffect, useCallback, useState } from 'react';
import { markdownToHtml, htmlToMarkdown } from '@domain/rules/memoRules';
import type { MemoFontSize } from '@domain/valueObjects/MemoFontSize';
import { MEMO_FONT_SIZE_CLASS } from '@domain/valueObjects/MemoFontSize';
import { isAllowedMemoImageMime } from '@domain/valueObjects/MemoImage';
import { MemoLinkDialog } from './MemoLinkDialog';

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

  // 링크 다이얼로그: 다이얼로그가 열리면 contentEditable의 selection이 사라지므로
  // 열 때의 Range를 보관해 두었다가 제출 시 복원한 뒤 삽입한다.
  const [linkDialog, setLinkDialog] = useState<{
    initialText: string;
    savedRange: Range | null;
  } | null>(null);

  const handleOpenLinkDialog = useCallback(() => {
    const editor = editorRef.current;
    if (editor === null) return;

    const selection = window.getSelection();
    let initialText = '';
    let savedRange: Range | null = null;

    if (
      selection !== null &&
      selection.rangeCount > 0 &&
      editor.contains(selection.anchorNode)
    ) {
      savedRange = selection.getRangeAt(0).cloneRange();
      if (!selection.isCollapsed) {
        initialText = selection.toString();
      }
    }

    setLinkDialog({ initialText, savedRange });
  }, []);

  const handleLinkCancel = useCallback(() => {
    setLinkDialog(null);
    // 다이얼로그가 닫히면 편집 영역에 포커스를 돌려주어 사용자가 편집을 이어갈 수 있게 한다
    requestAnimationFrame(() => {
      editorRef.current?.focus();
    });
  }, []);

  const handleLinkSubmit = useCallback(
    (href: string, text: string) => {
      const editor = editorRef.current;
      if (editor === null) {
        setLinkDialog(null);
        return;
      }

      // 저장된 selection 복원
      const savedRange = linkDialog?.savedRange;
      editor.focus();
      if (savedRange !== null && savedRange !== undefined) {
        const selection = window.getSelection();
        if (selection !== null) {
          selection.removeAllRanges();
          selection.addRange(savedRange);
        }
      }

      // 링크 HTML 생성 (href/text escape)
      const safeHref = href.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const safeText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      const html = `<a href="${safeHref}">${safeText}</a>`;

      document.execCommand('insertHTML', false, html);
      handleInput();
      setLinkDialog(null);
      // 삽입 후 포커스 재보장
      requestAnimationFrame(() => {
        editorRef.current?.focus();
      });
    },
    [linkDialog, handleInput],
  );

  // 링크 다이얼로그가 열려 있는 동안에는 contentEditable blur를 부모에게 전파하지 않는다.
  // 부모(MemoCard/MemoDetailPopup)의 onBlur 핸들러가 setEditing(false)를 호출해
  // 편집 모드가 종료되면서 다이얼로그와 에디터가 언마운트되는 것을 방지.
  const handleEditorBlur = useCallback(() => {
    if (linkDialog !== null) return;
    onBlur?.();
  }, [linkDialog, onBlur]);

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
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            handleOpenLinkDialog();
          }}
          className="flex h-7 w-7 items-center justify-center rounded text-sp-muted transition-colors hover:bg-black/10 hover:text-sp-text"
          aria-label="링크 삽입"
          title="링크 삽입"
        >
          <span className="material-symbols-outlined text-icon">link</span>
        </button>
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
          onBlur={handleEditorBlur}
          onKeyDown={onKeyDown}
          onPaste={handlePaste}
          className={`${className} ${MEMO_FONT_SIZE_CLASS[fontSize ?? 'base']} break-words`.trim()}
          style={style}
          suppressContentEditableWarning
        />
      </div>

      {linkDialog !== null && (
        <MemoLinkDialog
          isOpen
          initialText={linkDialog.initialText}
          initialHref=""
          onSubmit={handleLinkSubmit}
          onCancel={handleLinkCancel}
        />
      )}
    </>
  );
}

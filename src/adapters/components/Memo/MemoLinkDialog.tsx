import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isValidLinkHref } from '@domain/rules/memoRules';

interface MemoLinkDialogProps {
  isOpen: boolean;
  initialText: string;
  initialHref: string;
  onSubmit: (href: string, text: string) => void;
  onCancel: () => void;
}

/**
 * 링크 삽입 다이얼로그 — URL과 표시 제목을 별도로 받는다.
 * 제목이 비어 있으면 URL을 그대로 사용한다.
 */
export function MemoLinkDialog({
  isOpen,
  initialText,
  initialHref,
  onSubmit,
  onCancel,
}: MemoLinkDialogProps) {
  const [href, setHref] = useState(initialHref);
  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);
  const hrefInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setHref(initialHref);
      setText(initialText);
      setError(null);
      // 렌더 직후 focus
      requestAnimationFrame(() => {
        hrefInputRef.current?.focus();
        hrefInputRef.current?.select();
      });
    }
  }, [isOpen, initialHref, initialText]);

  const handleSubmit = useCallback(() => {
    const trimmedHref = href.trim();
    if (trimmedHref === '') {
      setError('URL을 입력하세요.');
      return;
    }
    if (!isValidLinkHref(trimmedHref)) {
      setError('http://, https://, mailto: 로 시작하는 URL만 지원합니다.');
      return;
    }
    const finalText = text.trim() === '' ? trimmedHref : text.trim();
    onSubmit(trimmedHref, finalText);
  }, [href, text, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      }
    },
    [handleSubmit, onCancel],
  );

  if (!isOpen) return null;

  const dialog = (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-xl bg-sp-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-base font-bold text-sp-text">링크 삽입</h2>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-sp-muted">URL</span>
          <input
            ref={hrefInputRef}
            type="url"
            value={href}
            onChange={(e) => {
              setHref(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com"
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
          />
        </label>

        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium text-sp-muted">
            제목 <span className="text-xs text-sp-muted/70">(선택 — 비우면 URL이 표시됨)</span>
          </span>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="링크에 표시할 텍스트"
            className="w-full rounded-lg border border-sp-border bg-sp-bg px-3 py-2 text-sm text-sp-text outline-none focus:border-sp-accent"
          />
        </label>

        {error !== null && (
          <p className="mb-3 text-xs text-red-400">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-sp-border px-4 py-2 text-sm text-sp-muted transition-colors hover:bg-sp-surface hover:text-sp-text"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-lg bg-sp-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
          >
            삽입
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

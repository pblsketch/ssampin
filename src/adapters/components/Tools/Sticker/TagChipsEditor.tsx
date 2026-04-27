import { useRef, useState, type KeyboardEvent } from 'react';
import { parseTags } from '@domain/rules/stickerRules';

interface TagChipsEditorProps {
  id?: string;
  tags: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

const MAX_TAGS = 10;

/**
 * 태그 입력 chips.
 * - 쉼표/공백/Enter로 분리
 * - Backspace로 마지막 태그 삭제
 * - X 버튼 클릭으로 개별 삭제
 * - parseTags() 사용으로 도메인 규칙 일관 적용
 */
export function TagChipsEditor({
  id,
  tags,
  onChange,
  placeholder,
}: TagChipsEditorProps): JSX.Element {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commitInput = () => {
    if (input.trim().length === 0) return;
    const merged = parseTags(`${tags.join(',')},${input}`);
    if (merged.length > MAX_TAGS) {
      onChange(merged.slice(0, MAX_TAGS));
    } else {
      onChange(merged);
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitInput();
    } else if (e.key === 'Backspace' && input.length === 0 && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  const removeTag = (idx: number) => {
    const next = [...tags];
    next.splice(idx, 1);
    onChange(next);
    inputRef.current?.focus();
  };

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="flex flex-wrap items-center gap-1.5 px-2.5 py-2 rounded-lg bg-sp-bg ring-1 ring-sp-border focus-within:ring-2 focus-within:ring-sp-accent transition-shadow min-h-[42px] cursor-text"
    >
      {tags.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sp-accent/15 text-sp-accent text-xs font-sp-medium ring-1 ring-sp-accent/20"
        >
          <span>#{tag}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              removeTag(i);
            }}
            aria-label={`${tag} 태그 삭제`}
            className="hover:text-sp-accent/70 -mr-0.5"
          >
            <span className="material-symbols-outlined text-[14px] leading-none">close</span>
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        id={id}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitInput}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm text-sp-text placeholder:text-sp-muted focus:outline-none"
      />
    </div>
  );
}

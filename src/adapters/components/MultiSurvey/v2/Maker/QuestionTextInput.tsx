/**
 * QuestionTextInput — 문항 본문 textarea
 *
 * sp-* 토큰: sp-border, sp-accent, sp-text, sp-bg
 * focus 시 border-sp-accent
 */

import { useId, type ChangeEvent } from 'react';

interface QuestionTextInputProps {
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly maxLength?: number;
  readonly label?: string;
}

export function QuestionTextInput({
  value,
  onChange,
  placeholder = '문항 내용을 입력하세요',
  rows = 3,
  maxLength,
  label,
}: QuestionTextInputProps): JSX.Element {
  const id = useId();

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={id} className="text-xs font-sp-medium text-sp-muted">
          {label}
        </label>
      )}
      <textarea
        id={id}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        aria-label={label ?? '문항 본문'}
        className={[
          'w-full px-3 py-2 bg-sp-bg text-sp-text text-base',
          'border border-sp-border rounded-lg resize-y',
          'placeholder:text-sp-muted',
          'focus:outline-none focus:border-sp-accent focus:ring-2 focus:ring-sp-accent/30',
          'transition-colors duration-sp-base motion-reduce:transition-none',
        ].join(' ')}
      />
      {typeof maxLength === 'number' && (
        <div className="text-right text-xs text-sp-muted tabular-nums">
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}

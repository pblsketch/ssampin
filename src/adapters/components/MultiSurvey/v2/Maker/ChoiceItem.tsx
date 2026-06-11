/**
 * ChoiceItem — 보기 항목 (체크박스 + 텍스트 + 삭제)
 *
 * - 체크박스: 복수 정답 허용 (MultipleQuestion 기준)
 * - 선택 시 bg-sp-accent/10 border-sp-accent
 * - 체크박스 aria-label 필수
 *
 * sp-* 토큰: sp-card, sp-border, sp-accent, sp-text, sp-duration-fast
 *
 * 참고: 디자인 토큰 표 'sp-duration-fast'는 실제로 sp-duration-quick(120ms)을 의미.
 *      신규 Tailwind 매핑은 duration-sp-quick 사용.
 */

import { useId, type ChangeEvent } from 'react';

interface ChoiceItemProps {
  readonly id: string;
  readonly index: number;
  readonly text: string;
  readonly isCorrect?: boolean;
  /** 정답 토글 가능 여부 (v1 survey 타입은 false) */
  readonly correctnessEnabled: boolean;
  readonly onTextChange: (next: string) => void;
  readonly onCorrectChange?: (next: boolean) => void;
  readonly onDelete: () => void;
  readonly disabled?: boolean;
}

export function ChoiceItem({
  id,
  index,
  text,
  isCorrect = false,
  correctnessEnabled,
  onTextChange,
  onCorrectChange,
  onDelete,
  disabled = false,
}: ChoiceItemProps): JSX.Element {
  const checkboxId = useId();

  const handleTextChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onTextChange(event.target.value);
  };

  const handleCorrectChange = (event: ChangeEvent<HTMLInputElement>): void => {
    onCorrectChange?.(event.target.checked);
  };

  const containerClass = [
    'group flex items-center gap-2 px-3 py-2 rounded-lg border bg-sp-card',
    'transition-colors duration-sp-quick motion-reduce:transition-none',
    isCorrect ? 'bg-sp-accent/10 border-sp-accent' : 'border-sp-border hover:border-sp-accent/40',
  ].join(' ');

  const choiceLabel = `보기 ${index + 1}`;

  return (
    <div className={containerClass} data-choice-id={id}>
      {correctnessEnabled ? (
        <input
          id={checkboxId}
          type="checkbox"
          checked={isCorrect}
          onChange={handleCorrectChange}
          disabled={disabled}
          aria-label={`${choiceLabel} 정답 표시`}
          className={[
            'w-4 h-4 rounded border-sp-border accent-sp-accent',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer',
          ].join(' ')}
        />
      ) : (
        <span aria-hidden="true" className="w-5 text-center text-sm font-sp-medium text-sp-muted">
          {index + 1}
        </span>
      )}

      <input
        type="text"
        value={text}
        onChange={handleTextChange}
        placeholder={`${choiceLabel} 텍스트`}
        disabled={disabled}
        aria-label={`${choiceLabel} 내용`}
        className={[
          'flex-1 bg-transparent text-sm text-sp-text outline-none',
          'placeholder:text-sp-muted',
          disabled ? 'opacity-50 cursor-not-allowed' : '',
        ].join(' ')}
      />

      <button
        type="button"
        onClick={onDelete}
        disabled={disabled}
        aria-label={`${choiceLabel} 삭제`}
        className={[
          'shrink-0 w-6 h-6 inline-flex items-center justify-center rounded',
          'text-sp-muted hover:text-sp-text hover:bg-sp-bg/40',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          'transition-opacity duration-sp-quick motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
          disabled ? 'cursor-not-allowed' : '',
        ].join(' ')}
      >
        ×
      </button>
    </div>
  );
}

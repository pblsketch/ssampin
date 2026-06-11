/**
 * QuestionListItem — 좌측 문항 목록의 행
 *
 * - 드래그 핸들 + 번호 + 유형 칩 + 타이머·점수
 * - hover 시 삭제 버튼 fade-in
 * - 선택된 문항에 border-l-4 border-sp-accent (부모 QuestionList가 적용)
 *
 * sp-* 토큰: sp-card, sp-border, sp-text, sp-muted, sp-accent, sp-duration-fast
 *      → 신규 Tailwind: duration-sp-quick(120ms)
 */

import { isQuizType, type Question } from '@domain/entities/multiSurvey/Question';
import { QuestionTypeChip } from './QuestionTypeChip';

interface QuestionListItemProps {
  readonly question: Question;
  readonly index: number;
  /** 자동 넘김 ON일 때만 타이머 표시 */
  readonly showTimer: boolean;
  readonly selected: boolean;
  readonly onSelect: () => void;
  readonly onDelete: () => void;
  readonly onDragStart: () => void;
  readonly onDragOver: (event: React.DragEvent<HTMLLIElement>) => void;
  readonly onDrop: () => void;
  readonly isDragging: boolean;
}

export function QuestionListItem({
  question,
  index,
  showTimer,
  selected,
  onSelect,
  onDelete,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: QuestionListItemProps): JSX.Element {
  const isQuiz = isQuizType(question.type);

  const handleDelete = (event: React.MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onDelete();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLLIElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <li
      role="option"
      aria-selected={selected}
      tabIndex={0}
      draggable
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={[
        'group relative flex items-center gap-2 px-2 py-2 rounded-lg bg-sp-card border border-sp-border',
        'cursor-pointer outline-none',
        'transition-colors duration-sp-quick motion-reduce:transition-none',
        'hover:border-sp-accent/40',
        'focus-visible:ring-2 focus-visible:ring-sp-accent',
        selected ? 'border-l-4 border-l-sp-accent' : '',
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
      data-question-id={question.id}
    >
      <span
        aria-hidden="true"
        className="shrink-0 text-sp-muted text-icon-sm cursor-grab active:cursor-grabbing"
        title="드래그하여 순서 변경"
      >
        ⋮⋮
      </span>

      <span className="shrink-0 w-6 text-center text-xs font-sp-semibold text-sp-muted tabular-nums">
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <p className="truncate text-sm text-sp-text font-sp-medium">
          {question.text || '(제목 없음)'}
        </p>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-sp-muted">
          <QuestionTypeChip type={question.type} />
          {showTimer && (
            <span aria-label="타이머" className="tabular-nums">
              ⏱ {question.timerSeconds}s
            </span>
          )}
          {isQuiz && (
            <span aria-label="점수" className="tabular-nums">
              ★ {question.score}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={handleDelete}
        aria-label={`문항 ${index + 1} 삭제`}
        className={[
          'shrink-0 w-6 h-6 inline-flex items-center justify-center rounded',
          'text-sp-muted hover:text-sp-text hover:bg-sp-bg/40',
          'opacity-0 group-hover:opacity-100 focus:opacity-100',
          'transition-opacity duration-sp-quick motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
        ].join(' ')}
      >
        ×
      </button>
    </li>
  );
}

/**
 * QuestionList — 좌측 문항 목록 (드래그 정렬)
 *
 * Q11 결정: v2 quiz 신규 작성만 지원. v1 → v2 변환 미채택.
 * 신규 문항 추가 시 기본 OX 타입(가장 단순)으로 생성.
 *
 * sp-* 토큰: sp-surface, sp-card, sp-border, sp-text, sp-muted, sp-accent,
 *           sp-shadow-sm, sp-shadow-md, sp-duration-base
 */

import { useState } from 'react';
import { useMultiSurveyV2Store, selectSessionById } from '@adapters/stores/useMultiSurveyV2Store';
import {
  OPINION_DEFAULT_TIMER_SECONDS,
  QNA_DEFAULT_MAX_LENGTH,
  WORDCLOUD_DEFAULT_MAX_WORDS,
  WORDCLOUD_DEFAULT_MAX_WORD_LENGTH,
  type OXQuestion,
  type QnaQuestion,
  type Question,
  type WordCloudQuestion,
} from '@domain/entities/multiSurvey/Question';
import { QuestionListItem } from './QuestionListItem';

interface QuestionListProps {
  readonly sessionId: string;
  readonly questions: readonly Question[];
  readonly selectedQuestionId: string | null;
  readonly onSelectQuestion: (id: string) => void;
}

function defaultQuestionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createDefaultQuestion(): OXQuestion {
  return {
    id: defaultQuestionId(),
    type: 'ox',
    text: '',
    timerSeconds: 20,
    score: 10,
    correctAnswer: 'O',
  };
}

/** 의견 수집 문항 기본값 — 정답·점수 없음, 타이머는 넉넉하게 */
function createWordCloudQuestion(): WordCloudQuestion {
  return {
    id: defaultQuestionId(),
    type: 'wordcloud',
    text: '',
    timerSeconds: OPINION_DEFAULT_TIMER_SECONDS,
    score: 0,
    maxWords: WORDCLOUD_DEFAULT_MAX_WORDS,
    maxWordLength: WORDCLOUD_DEFAULT_MAX_WORD_LENGTH,
  };
}

function createQnaQuestion(): QnaQuestion {
  return {
    id: defaultQuestionId(),
    type: 'qna',
    text: '',
    timerSeconds: OPINION_DEFAULT_TIMER_SECONDS,
    score: 0,
    maxLength: QNA_DEFAULT_MAX_LENGTH,
  };
}

/** 의견 수집 문항 추가 버튼 공통 스타일 (보조 액션) */
const SECONDARY_ADD_BUTTON_CLASS = [
  'flex-1 px-2 py-1.5 text-xs font-sp-medium rounded-lg',
  'border border-dashed border-sp-border text-sp-muted',
  'hover:text-sp-text hover:border-sp-accent',
  'transition-colors duration-sp-base motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
].join(' ');

export function QuestionList({
  sessionId,
  questions,
  selectedQuestionId,
  onSelectQuestion,
}: QuestionListProps): JSX.Element {
  const updateSession = useMultiSurveyV2Store((s) => s.updateSession);
  // 자동 넘김 OFF면 타이머는 동작하지 않으므로 칩에서도 숨김 (2026-06-11 사용자 결정)
  const showTimer = useMultiSurveyV2Store(
    (s) => selectSessionById(s, sessionId)?.responseOpts.autoAdvance ?? false,
  );
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleAddQuestion = (newQuestion: Question): void => {
    const next = [...questions, newQuestion];
    updateSession(sessionId, { questions: next });
    onSelectQuestion(newQuestion.id);
  };

  const handleAdd = (): void => {
    handleAddQuestion(createDefaultQuestion());
  };

  const handleDelete = (id: string): void => {
    const next = questions.filter((q) => q.id !== id);
    updateSession(sessionId, { questions: next });
    if (selectedQuestionId === id) {
      const fallback = next[0]?.id;
      if (fallback) onSelectQuestion(fallback);
    }
  };

  const handleDragStart = (index: number) => (): void => {
    setDragIndex(index);
  };

  const handleDragOver = (event: React.DragEvent<HTMLLIElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (targetIndex: number) => (): void => {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    const next = [...questions];
    const [moved] = next.splice(dragIndex, 1);
    if (moved) {
      next.splice(targetIndex, 0, moved);
      updateSession(sessionId, { questions: next });
    }
    setDragIndex(null);
  };

  return (
    <aside
      className={[
        'flex flex-col h-full bg-sp-surface border-r border-sp-border shadow-sp-sm',
        'transition-colors duration-sp-base motion-reduce:transition-none',
      ].join(' ')}
      aria-label="문항 목록"
    >
      <header className="shrink-0 px-3 py-3 border-b border-sp-border">
        <h2 className="text-sm font-sp-semibold text-sp-text">문항 ({questions.length})</h2>
      </header>

      <ul role="listbox" aria-label="문항 선택" className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {questions.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-sp-muted">문항을 추가해주세요</li>
        )}
        {questions.map((q, idx) => (
          <QuestionListItem
            key={q.id}
            question={q}
            index={idx}
            showTimer={showTimer}
            selected={q.id === selectedQuestionId}
            onSelect={() => onSelectQuestion(q.id)}
            onDelete={() => handleDelete(q.id)}
            onDragStart={handleDragStart(idx)}
            onDragOver={handleDragOver}
            onDrop={handleDrop(idx)}
            isDragging={dragIndex === idx}
          />
        ))}
      </ul>

      <footer className="shrink-0 p-2 border-t border-sp-border flex flex-col gap-1.5">
        <button
          type="button"
          onClick={handleAdd}
          className={[
            'w-full px-3 py-2 text-sm font-sp-medium rounded-lg',
            'bg-sp-accent text-white shadow-sp-sm hover:shadow-sp-md',
            'transition-shadow duration-sp-base motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sp-surface',
          ].join(' ')}
        >
          + 문항 추가
        </button>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => handleAddQuestion(createWordCloudQuestion())}
            title="학생이 낸 단어를 모아 크기로 보여주는 문항"
            className={SECONDARY_ADD_BUTTON_CLASS}
          >
            + 워드클라우드
          </button>
          <button
            type="button"
            onClick={() => handleAddQuestion(createQnaQuestion())}
            title="학생이 익명으로 질문을 내는 문항"
            className={SECONDARY_ADD_BUTTON_CLASS}
          >
            + 질문받기
          </button>
        </div>
      </footer>
    </aside>
  );
}

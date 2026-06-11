/**
 * ChoiceList — 보기 목록 컨테이너 (드래그 정렬, 추가/삭제)
 *
 * 지원 타입:
 * - v2 multiple (correctnessEnabled=true, 최대 5개)
 * - v1 single-choice / multi-choice (correctnessEnabled=false)
 *
 * sp-* 토큰: sp-card, sp-border, sp-accent, sp-duration-base
 *
 * 드래그 정렬: native HTML5 DnD (외부 의존성 회피).
 */

import { useState, type DragEvent } from 'react';
import { useMultiSurveyV2Store } from '@adapters/stores/useMultiSurveyV2Store';
import type {
  Choice,
  MultipleQuestion,
  SingleChoiceQuestion,
  MultiChoiceQuestion,
} from '@domain/entities/multiSurvey/Question';
import { ChoiceItem } from './ChoiceItem';

interface ChoiceListProps {
  readonly sessionId: string;
  readonly question: SingleChoiceQuestion | MultiChoiceQuestion | MultipleQuestion;
  readonly maxChoices?: number;
}

function defaultChoiceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getChoices(
  question: SingleChoiceQuestion | MultiChoiceQuestion | MultipleQuestion,
): readonly Choice[] {
  if (question.type === 'multiple') return question.choices;
  return question.options;
}

export function ChoiceList({ sessionId, question, maxChoices = 5 }: ChoiceListProps): JSX.Element {
  const updateSession = useMultiSurveyV2Store((s) => s.updateSession);
  const sessions = useMultiSurveyV2Store((s) => s.sessions);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const choices = getChoices(question);
  const correctnessEnabled = question.type === 'multiple';
  const correctIds =
    question.type === 'multiple' ? question.correctChoiceIds : ([] as readonly string[]);

  const patchQuestion = (
    nextChoices: readonly Choice[],
    nextCorrectIds?: readonly string[],
  ): void => {
    const current = sessions.find((sess) => sess.id === sessionId);
    if (!current) return;
    const nextQuestions = current.questions.map((q) => {
      if (q.id !== question.id) return q;
      if (q.type === 'multiple') {
        const updated: MultipleQuestion = {
          ...q,
          choices: nextChoices,
          correctChoiceIds: nextCorrectIds ?? q.correctChoiceIds,
        };
        return updated;
      }
      if (q.type === 'single-choice') {
        const updated: SingleChoiceQuestion = { ...q, options: nextChoices };
        return updated;
      }
      if (q.type === 'multi-choice') {
        const updated: MultiChoiceQuestion = { ...q, options: nextChoices };
        return updated;
      }
      return q;
    });
    updateSession(sessionId, { questions: nextQuestions });
  };

  const handleAdd = (): void => {
    if (choices.length >= maxChoices) return;
    const newChoice: Choice = { id: defaultChoiceId(), text: '' };
    patchQuestion([...choices, newChoice]);
  };

  const handleDelete = (choiceId: string): void => {
    const next = choices.filter((c) => c.id !== choiceId);
    const nextCorrect = correctIds.filter((id) => id !== choiceId);
    patchQuestion(next, nextCorrect);
  };

  const handleTextChange = (choiceId: string, text: string): void => {
    const next = choices.map((c) => (c.id === choiceId ? { ...c, text } : c));
    patchQuestion(next);
  };

  const handleCorrectChange = (choiceId: string, checked: boolean): void => {
    if (!correctnessEnabled) return;
    const next = checked
      ? [...new Set([...correctIds, choiceId])]
      : correctIds.filter((id) => id !== choiceId);
    patchQuestion(choices, next);
  };

  const handleDragStart =
    (index: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      setDragIndex(index);
      event.dataTransfer.effectAllowed = 'move';
    };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const handleDrop =
    (targetIndex: number) =>
    (event: DragEvent<HTMLDivElement>): void => {
      event.preventDefault();
      if (dragIndex === null || dragIndex === targetIndex) return;
      const next = [...choices];
      const [moved] = next.splice(dragIndex, 1);
      if (moved) {
        next.splice(targetIndex, 0, moved);
        patchQuestion(next);
      }
      setDragIndex(null);
    };

  const canAdd = choices.length < maxChoices;

  return (
    <div
      className={[
        'flex flex-col gap-2 p-2 bg-sp-card border border-sp-border rounded-lg',
        'transition-colors duration-sp-base motion-reduce:transition-none',
      ].join(' ')}
      aria-label="보기 목록"
    >
      {choices.length === 0 && (
        <p className="text-sm text-sp-muted text-center py-3">보기를 추가해주세요</p>
      )}

      {choices.map((choice, idx) => (
        <div
          key={choice.id}
          draggable
          onDragStart={handleDragStart(idx)}
          onDragOver={handleDragOver}
          onDrop={handleDrop(idx)}
          className={dragIndex === idx ? 'opacity-50' : ''}
        >
          <ChoiceItem
            id={choice.id}
            index={idx}
            text={choice.text}
            isCorrect={correctnessEnabled && correctIds.includes(choice.id)}
            correctnessEnabled={correctnessEnabled}
            onTextChange={(text) => handleTextChange(choice.id, text)}
            onCorrectChange={(checked) => handleCorrectChange(choice.id, checked)}
            onDelete={() => handleDelete(choice.id)}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className={[
          'mt-1 px-3 py-2 text-sm font-sp-medium rounded-lg border border-dashed',
          'border-sp-border text-sp-muted hover:border-sp-accent hover:text-sp-accent',
          'transition-colors duration-sp-base motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sp-accent',
          'disabled:opacity-50 disabled:cursor-not-allowed',
        ].join(' ')}
      >
        + 보기 추가 ({choices.length}/{maxChoices})
      </button>
    </div>
  );
}

import type { MultiSurveyV2 } from '../entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '../entities/multiSurvey/LiveSession';
import type { Response } from '../entities/multiSurvey/Response';
import type { Question } from '../entities/multiSurvey/Question';
import { isAdvancedType, type AdvancedQuestion } from '../entities/multiSurvey/AdvancedQuestion';
import { advancedAnswerLabel } from './advancedQuestionRules';

export function questionHasAnswer(question: Question): boolean {
  return isAdvancedType(question.type)
    ? !!(question as AdvancedQuestion).solution
    : ['ox', 'multiple', 'short', 'blank'].includes(question.type);
}

export function participationStandings(
  live: LiveSession,
  responses: readonly Response[] = live.responses,
) {
  const rows = live.students
    .map((student) => {
      const own = responses.filter((r) => r.studentId === student.studentId);
      return {
        studentId: student.studentId,
        nickname: student.nickname,
        correctCount: own.filter((r) => r.isCorrect === true).length,
        score: own.reduce((sum, r) => sum + r.scoreEarned, 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname, 'ko'));
  return rows.map((row) => ({ ...row, rank: rows.findIndex((r) => r.score === row.score) + 1 }));
}

export function answerLabel(question: Question, answer: Response['answer']): string {
  if (isAdvancedType(question.type))
    return advancedAnswerLabel(question as AdvancedQuestion, answer);
  const options =
    question.type === 'multiple'
      ? question.choices
      : question.type === 'single-choice' || question.type === 'multi-choice'
        ? question.options
        : [];
  return Array.isArray(answer)
    ? answer.map((id) => options.find((o) => o.id === id)?.text ?? id).join(', ')
    : String(answer);
}

export function correctAnswerLabel(question: Question): string | undefined {
  if (isAdvancedType(question.type)) {
    const q = question as AdvancedQuestion;
    if (!q.solution) return undefined;
    if (q.type === 'order') return advancedAnswerLabel(q, JSON.stringify(q.solution.order));
    if (q.type === 'numeric')
      return `${q.solution.number}${q.settings.unit} (허용 오차 ±${q.solution.tolerance})`;
    return '표시한 정답 영역';
  }
  switch (question.type) {
    case 'ox':
      return question.correctAnswer;
    case 'multiple':
      return answerLabel(question, question.correctChoiceIds);
    case 'short':
    case 'blank':
      return question.acceptedAnswers.join(' / ');
    default:
      return undefined;
  }
}

export function buildPersonalResults(live: LiveSession, survey: MultiSurveyV2) {
  const current = survey.questions[live.currentQuestionIndex];
  const closed = live.phase !== 'lobby' && live.phase !== 'open';
  const completed = survey.questions
    .slice(0, live.currentQuestionIndex + (closed ? 1 : 0))
    .filter(questionHasAnswer);
  const ids = new Set(completed.map((q) => q.id));
  const published = live.responses.filter((r) => ids.has(r.questionId));
  const previous = participationStandings(
    live,
    published.filter((r) => r.questionId !== current?.id),
  );
  return participationStandings(live, published).map((row) => {
    const response = closed
      ? published.find((r) => r.questionId === current?.id && r.studentId === row.studentId)
      : undefined;
    return {
      studentId: row.studentId,
      correctCount: row.correctCount,
      score: row.score,
      completedCount: completed.length,
      ...(survey.competitionMode
        ? {
            rank: row.rank,
            rankChange:
              (previous.find((r) => r.studentId === row.studentId)?.rank ?? row.rank) - row.rank,
          }
        : {}),
      ...(closed && current && questionHasAnswer(current)
        ? {
            isCorrect: response?.isCorrect ?? false,
            answer: correctAnswerLabel(current),
            explanation: survey.presentationOpts.revealExplanation
              ? current.explanation
              : undefined,
          }
        : {}),
      review: completed.map((q) => {
        const own = published.find((r) => r.studentId === row.studentId && r.questionId === q.id);
        return {
          question: q.text,
          isCorrect: own?.isCorrect === true,
          answer: correctAnswerLabel(q),
          explanation: survey.presentationOpts.revealExplanation ? q.explanation : undefined,
        };
      }),
    };
  });
}

export interface ParticipationResult {
  readonly id: string;
  readonly survey: MultiSurveyV2;
  readonly live: LiveSession;
}

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

/**
 * 학생 기기로 내려보낼 개인 결과.
 *
 * `revealAnswer` 가 false 면 **정답·정오·해설을 빼고** 만든다. 응답 분포만 공개하고
 * 정답은 아직 감추는 단계(설계 §3)에서 쓴다. 이때는 이번 문항을 누적 정답 수에서도
 * 빼야 한다 — 1번 문항에서 `1문항 중 1문항 정답` 은 그 자체로 정답을 알려 준다.
 */
export function buildPersonalResults(
  live: LiveSession,
  survey: MultiSurveyV2,
  options: { readonly revealAnswer?: boolean } = {},
) {
  const revealAnswer = options.revealAnswer ?? true;
  const current = survey.questions[live.currentQuestionIndex];
  const closed = live.phase !== 'lobby' && live.phase !== 'open' && revealAnswer;
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
      review: buildReview(live, survey, row.studentId),
    };
  });
}

/**
 * 활동을 마친 학생이 돌아볼 목록.
 *
 * 정답이 있는 문항만 보여 주던 것을 **내가 답한 모든 문항**으로 넓혔다 —
 * 토론·설문 문항에서 자기가 쓴 생각과 근거를 다시 읽는 것이 수업 마무리다.
 * 차수가 여럿이면 `myFirst` 에 처음 생각을 함께 담는다.
 */
function buildReview(live: LiveSession, survey: MultiSurveyV2, studentId: string) {
  const history = live.responseHistory ?? [];
  return survey.questions
    .map((q) => {
      const own = live.responses.find((r) => r.studentId === studentId && r.questionId === q.id);
      const earlier = history
        .filter((r) => r.studentId === studentId && r.questionId === q.id)
        .sort((a, b) => (a.attempt ?? 1) - (b.attempt ?? 1))[0];
      if (!own && !earlier) return null;
      const scored = questionHasAnswer(q);
      return {
        question: q.text,
        isCorrect: own?.isCorrect === true,
        ...(own ? { mine: answerLabel(q, own.answer) } : {}),
        ...(own?.reason ? { myReason: own.reason } : {}),
        ...(earlier ? { myFirst: answerLabel(q, earlier.answer) } : {}),
        ...(scored
          ? {
              answer: correctAnswerLabel(q),
              explanation: survey.presentationOpts.revealExplanation ? q.explanation : undefined,
            }
          : {}),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
}

export interface ParticipationResult {
  readonly id: string;
  readonly survey: MultiSurveyV2;
  readonly live: LiveSession;
}

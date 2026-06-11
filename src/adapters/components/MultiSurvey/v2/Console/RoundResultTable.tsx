/**
 * RoundResultTable — 중간 순위 표 (round_result phase).
 *
 * - DN-09: displayOpts.showPerQuestionScore === true 일 때만 도달.
 * - 학생별 누적 점수, 정답 수, 정답률 정렬.
 * - 행 등장 시 스태거 fade-in (sp-duration-slow 간격).
 *
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-muted / sp-accent
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Question } from '@domain/entities/multiSurvey/Question';
import { isQuizType } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import { calcAccuracy } from '@domain/rules/multiSurveyRules';

interface RoundResultTableProps {
  readonly students: readonly StudentProfile[];
  readonly responses: readonly Response[];
  readonly questions: readonly Question[];
}

interface StudentRow {
  readonly studentId: string;
  readonly nickname: string;
  readonly score: number;
  readonly accuracy: number;
  readonly correctCount: number;
  readonly quizCount: number;
  readonly hasQuiz: boolean;
}

function computeRows(
  students: readonly StudentProfile[],
  responses: readonly Response[],
  questions: readonly Question[],
): readonly StudentRow[] {
  const quizQuestionIds = new Set(questions.filter((q) => isQuizType(q.type)).map((q) => q.id));
  const hasQuiz = quizQuestionIds.size > 0;

  const rows: StudentRow[] = students.map((s) => {
    const myResponses = responses.filter((r) => r.studentId === s.studentId);
    const myQuiz = myResponses.filter((r) => quizQuestionIds.has(r.questionId));
    const score = myResponses.reduce((sum, r) => sum + r.scoreEarned, 0);
    const accuracy = calcAccuracy(myQuiz);
    const correctCount = myQuiz.filter((r) => r.isCorrect === true).length;
    return {
      studentId: s.studentId,
      nickname: s.nickname,
      score,
      accuracy,
      correctCount,
      quizCount: myQuiz.length,
      hasQuiz,
    };
  });

  return rows.slice().sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return a.nickname.localeCompare(b.nickname);
  });
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
  }, []);
  return reduced;
}

function RoundResultTableImpl({
  students,
  responses,
  questions,
}: RoundResultTableProps): JSX.Element {
  const rows = useMemo(
    () => computeRows(students, responses, questions),
    [students, responses, questions],
  );
  const reduced = usePrefersReducedMotion();
  const hasQuizMetric = rows.some((r) => r.hasQuiz);

  return (
    <section
      className="flex w-full flex-col gap-4 rounded-2xl border border-sp-border bg-sp-card p-8"
      aria-label="중간 순위"
    >
      <header className="flex items-baseline justify-between">
        <span className="font-sp-bold text-sp-text" style={{ fontSize: 28 }}>
          중간 순위
        </span>
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 16 }}>
          총 {rows.length}명
        </span>
      </header>
      <table className="w-full border-collapse" aria-label="학생별 순위표">
        <thead>
          <tr className="border-b border-sp-border text-left">
            <th className="py-3 font-sp-semibold text-sp-muted" style={{ fontSize: 14, width: 80 }}>
              순위
            </th>
            <th className="py-3 font-sp-semibold text-sp-muted" style={{ fontSize: 14 }}>
              학생
            </th>
            <th
              className="py-3 text-right font-sp-semibold text-sp-muted"
              style={{ fontSize: 14, width: 120 }}
            >
              점수
            </th>
            {hasQuizMetric && (
              <th
                className="py-3 text-right font-sp-semibold text-sp-muted"
                style={{ fontSize: 14, width: 140 }}
              >
                정답률
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const rank = idx + 1;
            const style: React.CSSProperties = reduced
              ? {}
              : {
                  animation: `fadeIn var(--sp-duration-slow) var(--sp-ease-out) both`,
                  animationDelay: `${idx * 60}ms`,
                };
            return (
              <tr key={row.studentId} className="border-b border-sp-border" style={style}>
                <td className="py-4 font-sp-bold text-sp-accent" style={{ fontSize: 22 }}>
                  {rank}
                </td>
                <td className="py-4 font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
                  {row.nickname}
                </td>
                <td className="py-4 text-right font-sp-bold text-sp-text" style={{ fontSize: 22 }}>
                  {row.score}점
                </td>
                {hasQuizMetric && (
                  <td
                    className="py-4 text-right font-sp-medium text-sp-muted"
                    style={{ fontSize: 16 }}
                  >
                    {row.hasQuiz && row.quizCount > 0
                      ? `${Math.round(row.accuracy * 100)}% (${row.correctCount}/${row.quizCount})`
                      : '—'}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export const RoundResultTable = memo(RoundResultTableImpl);

import { QuestionResponseSummary } from './QuestionResponseSummary';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import {
  answerLabel,
  participationStandings,
  questionHasAnswer,
} from '@domain/rules/participationRules';

export function ParticipationResults({
  survey,
  live,
  compact = false,
}: {
  survey: MultiSurveyV2;
  live: LiveSession;
  compact?: boolean;
}) {
  const scores =
    !compact && survey.questions.some(questionHasAnswer) ? (
      <div className="overflow-auto">
        <h2 className="mb-3 text-lg font-bold">
          {survey.competitionMode ? '순위와 점수' : '학생별 결과'}
        </h2>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {survey.competitionMode && <th className="p-2">순위</th>}
              <th className="p-2">별명</th>
              <th className="p-2">정답 수</th>
              <th className="p-2">점수</th>
            </tr>
          </thead>
          <tbody>
            {participationStandings(live).map((row) => (
              <tr key={row.studentId} className="border-t border-sp-border">
                {survey.competitionMode && (
                  <td className="p-2 font-bold text-sp-accent">{row.rank}위</td>
                )}
                <td className="p-2">{row.nickname}</td>
                <td className="p-2">{row.correctCount}</td>
                <td className="p-2 font-bold">{row.score}점</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!live.students.length && (
          <p className="py-6 text-sp-muted">학생이 참여하면 결과가 나타나요.</p>
        )}
      </div>
    ) : null;
  const questions = compact
    ? survey.questions.filter((_, i) => i === live.currentQuestionIndex)
    : survey.questions;
  return (
    <div className="space-y-6">
      {scores}
      {questions.map((q) => (
        <section key={q.id}>
          <h2 className="mb-3 text-lg font-bold">{q.text}</h2>
          <QuestionResponseSummary
            question={q}
            responses={live.responses.filter((r) => r.questionId === q.id)}
          />
          {live.votesByQuestion?.[q.id]?.map((v) => (
            <p key={v.id} className="mt-2 text-sp-accent">
              {v.text} · 공감 {v.count}
            </p>
          ))}
          <details className="mt-4">
            <summary>학생별 응답 보기 · 교사 화면에만 나와요</summary>
            <div className="space-y-3">
              {live.students.map((student) => {
                const current = live.responses.find(
                  (r) => r.questionId === q.id && r.studentId === student.studentId,
                );
                const previous = (live.responseHistory ?? []).filter(
                  (r) => r.questionId === q.id && r.studentId === student.studentId,
                );
                if (!current && !previous.length) return null;
                return (
                  <article
                    key={student.studentId}
                    className="rounded-xl border border-sp-border bg-sp-card p-4"
                  >
                    <p className="text-sm text-sp-muted">{student.nickname}</p>
                    {previous.map((r, i) => (
                      <div key={i} className="my-2 border-l-2 border-sp-border pl-3 text-sp-muted">
                        <p>
                          {r.attempt ?? i + 1}차 · {answerLabel(q, r.answer)}
                        </p>
                        {r.reason && <p>이유: {r.reason}</p>}
                      </div>
                    ))}
                    {current ? (
                      <>
                        <p className="mt-2 font-bold">
                          {previous.length ? '지금 생각 · ' : ''}
                          {answerLabel(q, current.answer)}
                        </p>
                        {current.reason && <p className="mt-2">{current.reason}</p>}
                      </>
                    ) : (
                      <p>새 응답을 기다리고 있어요.</p>
                    )}
                  </article>
                );
              })}
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}

/**
 * ParticipationRoundCompare — 토론 앞뒤로 생각이 어떻게 달라졌는지 견주는 화면.
 *
 * 자료는 새로 만들지 않는다. `reopenDiscussion()` 이 앞선 응답을 `responseHistory` 로
 * 옮겨 두므로 그것을 차수별로 묶어 보여 준다.
 *
 * 지키는 것:
 *  - 차수마다 **참여 인원을 따로** 적는다. 1차 18명과 2차 21명은 다른 모수다.
 *  - 개인별 변화는 **같은 참여자로 이어지는 경우에만** 잇는다. 추정으로 잇지 않는다.
 *  - 입장이 바뀐 것을 향상·점수로 해석하지 않는다. 설문·의견 문항에 정오 표시를 붙이지 않는다.
 *  - 수보다 **근거를 읽게** 한다 — Kialo 처럼 입장별 글을 나란히 둔다.
 */

import { useMemo } from 'react';
import type { MultiSurveyV2 } from '@domain/entities/multiSurvey/MultiSurveyV2';
import type { LiveSession } from '@domain/entities/multiSurvey/LiveSession';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { answerLabel } from '@domain/rules/participationRules';

interface Round {
  readonly attempt: number;
  readonly responses: readonly Response[];
}

function groupRounds(live: LiveSession, question: Question): readonly Round[] {
  const history = (live.responseHistory ?? []).filter((r) => r.questionId === question.id);
  const current = live.responses.filter((r) => r.questionId === question.id);
  const byAttempt = new Map<number, Response[]>();
  for (const r of history) {
    const key = r.attempt ?? 1;
    byAttempt.set(key, [...(byAttempt.get(key) ?? []), r]);
  }
  if (current.length > 0) {
    const key = live.attempt ?? 1;
    byAttempt.set(key, [...(byAttempt.get(key) ?? []), ...current]);
  }
  return [...byAttempt.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([attempt, responses]) => ({ attempt, responses }));
}

/** 응답을 읽을 수 있는 말로 바꿔 세어 본다. 많이 나온 순. */
function tallyAnswers(
  question: Question,
  responses: readonly Response[],
): readonly { label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of responses) {
    const label = answerLabel(question, r.answer) || '(빈 응답)';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ko'));
}

export function ParticipationRoundCompare({
  survey,
  live,
  question,
}: {
  survey: MultiSurveyV2;
  live: LiveSession;
  question: Question;
}) {
  const rounds = useMemo(() => groupRounds(live, question), [live, question]);
  if (rounds.length < 2) return null;
  const first = rounds[0]!;
  const latest = rounds[rounds.length - 1]!;

  /** 두 차수 모두에 응답한 학생만 잇는다 — 이어지지 않는 응답은 추정하지 않는다. */
  const changes = live.students
    .map((student) => {
      const before = first.responses.find((r) => r.studentId === student.studentId);
      const after = latest.responses.find((r) => r.studentId === student.studentId);
      if (!before || !after) return null;
      const beforeLabel = answerLabel(question, before.answer);
      const afterLabel = answerLabel(question, after.answer);
      return {
        studentId: student.studentId,
        nickname: student.nickname,
        beforeLabel,
        afterLabel,
        beforeReason: before.reason,
        afterReason: after.reason,
        moved: beforeLabel !== afterLabel,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  const unlinked = latest.responses.filter(
    (r) => !first.responses.some((b) => b.studentId === r.studentId),
  ).length;

  return (
    <section
      aria-label="토론 전후 비교"
      className="rounded-2xl border border-sp-border bg-sp-card p-5"
    >
      <h3 className="text-lg font-bold">처음 생각과 토론 뒤 생각</h3>
      <p className="mt-1 text-xs text-sp-muted">
        차수마다 응답한 사람이 달라요. 입장이 바뀐 것이 더 나은 답이라는 뜻은 아니에요.
      </p>

      <div className="mt-4 space-y-4">
        {rounds.map((round) => {
          const total = round.responses.length;
          return (
            <div key={round.attempt}>
              <p className="mb-2 text-sm font-bold">
                {round.attempt === 1 ? '처음 생각' : `${round.attempt}차 · 토론 뒤 생각`}
                <span className="ml-2 font-normal text-sp-muted">{total}명 응답</span>
              </p>
              <ul className="space-y-1">
                {tallyAnswers(question, round.responses).map((row) => (
                  <li key={row.label}>
                    <p className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{row.label}</span>
                      <span className="shrink-0 text-sp-muted">{row.count}명</span>
                    </p>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-sp-border">
                      <div
                        className="h-2 rounded-full bg-sp-accent"
                        style={{ width: `${total ? (row.count / total) * 100 : 0}%` }}
                      />
                    </div>
                  </li>
                ))}
                {total === 0 && <li className="text-sm text-sp-muted">응답이 없어요.</li>}
              </ul>
            </div>
          );
        })}
      </div>

      {changes.length > 0 && (
        <details className="mt-5">
          <summary className="cursor-pointer text-sm">
            사람별로 견주기 · 교사 화면에만 나와요 ({changes.length}명)
          </summary>
          <p className="mt-2 text-xs text-sp-muted">
            두 차수에 모두 응답한 학생만 이었어요.
            {unlinked > 0 && ` 이번 차수에만 응답한 ${unlinked}명은 잇지 않았어요.`}
          </p>
          <ul className="mt-3 space-y-3">
            {changes.map((c) => (
              <li key={c.studentId} className="rounded-xl border border-sp-border p-3">
                <p className="text-sm font-bold">
                  {c.nickname}
                  {c.moved && (
                    <span className="ml-2 rounded-full border border-sp-info px-2 py-0.5 text-xs font-normal text-sp-info">
                      생각이 달라졌어요
                    </span>
                  )}
                </p>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-sp-muted">처음 생각</p>
                    <p className="text-sm">{c.beforeLabel}</p>
                    {c.beforeReason && (
                      <p className="mt-1 border-l-2 border-sp-border pl-2 text-sm text-sp-muted">
                        {c.beforeReason}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-sp-muted">토론 뒤 생각</p>
                    <p className="text-sm">{c.afterLabel}</p>
                    {c.afterReason && (
                      <p className="mt-1 border-l-2 border-sp-accent pl-2 text-sm">
                        {c.afterReason}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
      {survey.competitionMode && (
        <p className="mt-3 text-xs text-sp-muted">
          다시 받은 응답은 점수에 더하지 않아요. 생각의 변화만 견줘 보세요.
        </p>
      )}
    </section>
  );
}

/**
 * ParticipationShare — 참여교실 교실 화면(TV·빔프로젝터용 별도 창) 본문.
 *
 * 이 화면은 **교실 맨 뒷자리에서 보는 화면**이다. 조작 단추를 두지 않고, 글자를 크게 쓴다.
 * 결과 그림은 `QuestionResponseSummary` 를 `size="display"` 로 부른다 —
 * 교사 콘솔과 같은 크기로 그리면 뒷자리에서 안 읽힌다.
 *
 * 학생 이름(별명)은 절대 그리지 않는다 — 이름은 교사 콘솔에만 남는다.
 *
 * 응답을 받는 중(open)에는 정답이 있는 문항의 결과를 그리지 않는다(정답 유출 방지).
 * 정답이 없는 의견 문항은 모이는 대로 보여 준다 — 그게 교실 화면의 쓸모다.
 *
 * 보기 글자(A·B·C)는 학생 휴대폰과 **같은 글자**다. 선생님이 "B 고른 사람?" 하고 부를 수 있다.
 */

import { QuestionResponseSummary } from './QuestionResponseSummary';
import { ShareEntryCodeBar } from './v2/Share/ShareEntryCodeBar';
import { ShareLobbyScreen } from './v2/Share/ShareLobbyScreen';
import type { ShareSnapshot } from './v2/Share/shareSnapshot';
import { questionHasAnswer } from '@domain/rules/participationRules';

export function ParticipationShare({ snapshot }: { snapshot: ShareSnapshot }) {
  const data = snapshot.participation;
  if (!data) return null;
  const question = snapshot.currentQuestion;
  const finished = snapshot.phase === 'end' || snapshot.phase === 'podium';
  const scored = !!question && questionHasAnswer(question);
  const total = snapshot.students.length;
  const answered = data.answeredCount;
  const everyone = total > 0 && answered >= total;
  const choices =
    question?.type === 'multiple'
      ? question.choices
      : question?.type === 'single-choice' || question?.type === 'multi-choice'
        ? question.options
        : question?.type === 'ox'
          ? [
              { id: 'O', text: '맞아요' },
              { id: 'X', text: '아니에요' },
            ]
          : [];
  const traffic = question?.presentation === 'trafficlight';
  /** 응답 받는 중에 결과를 보여도 되는 문항인가 — 정답이 없는 의견 문항만 */
  const showLive = snapshot.phase === 'open' && !scored && snapshot.responsesForCurrent.length > 0;
  /** 공감 목록이 이미 모든 생각을 담고 있으면 같은 글을 두 번 그리지 않는다. */
  const votes = data.votes ?? [];
  const voted = votes.some((v) => v.count > 0);
  /**
   * 2×2 매트릭스 결과 판은 정사각형이라 위아래로 쌓으면 높이에 묶여 작아지고
   * 16:9 화면의 가로 60%가 빈다. 이 문항만 질문·현황을 왼쪽 단으로 보내고
   * 오른쪽 단을 판에 통째로 준다 — 판 한 변이 44vh 에서 76vh 로 커진다.
   */
  const squareChart = !finished && question?.type === 'quadrant';
  return (
    <main className="flex h-screen flex-col overflow-auto bg-sp-bg text-sp-text">
      <ShareEntryCodeBar
        entryUrl={snapshot.entryUrl}
        entryCode={snapshot.entryCode}
        studentCount={total}
      />
      {snapshot.phase === 'lobby' ? (
        <>
          <h1 className="px-8 pt-8 text-center text-5xl font-bold leading-tight">{data.title}</h1>
          <ShareLobbyScreen entryUrl={snapshot.entryUrl} students={snapshot.students} />
        </>
      ) : (
        <div
          className={`mx-auto flex w-full max-w-[1600px] flex-1 px-12 py-10 ${
            squareChart ? 'items-stretch gap-12' : 'flex-col'
          }`}
        >
          <div
            className={squareChart ? 'flex w-[38%] shrink-0 flex-col justify-center' : 'contents'}
          >
            {finished ? (
              <h1 className="text-6xl font-bold leading-tight">함께해서 즐거웠어요!</h1>
            ) : (
              <header className="mb-8">
                <div className="mb-4 flex items-center gap-4">
                  <span className="rounded-full bg-sp-accent px-5 py-1 text-2xl font-bold text-sp-accent-fg">
                    {snapshot.questionNumber}번
                  </span>
                  <span className="text-2xl text-sp-muted">
                    전체 {snapshot.totalQuestions}문항 중
                  </span>
                  <span
                    className={`rounded-full border-2 px-4 py-1 text-2xl font-bold ${
                      snapshot.phase === 'open'
                        ? 'border-sp-border text-sp-muted'
                        : 'border-sp-highlight text-sp-highlight'
                    }`}
                  >
                    {snapshot.phase === 'open' ? '응답 받는 중' : '결과 공개'}
                  </span>
                </div>
                <h1 className="break-keep text-6xl font-bold leading-tight">{question?.text}</h1>
              </header>
            )}

            {!finished && (
              <section className="mb-10" aria-label="응답 현황">
                <div className="flex items-end justify-between gap-6">
                  <p className="flex items-baseline gap-3">
                    {/* key 를 값으로 두면 숫자가 바뀔 때만 다시 그려져 살짝 커졌다 돌아온다. */}
                    <strong
                      key={answered}
                      className="animate-scale-in font-mono text-7xl tabular-nums text-sp-accent motion-reduce:animate-none"
                    >
                      {answered}
                    </strong>
                    <span className="text-4xl text-sp-muted">
                      / <span className="font-mono tabular-nums">{total}</span>명
                    </span>
                  </p>
                  <p className="text-3xl font-bold text-sp-muted">
                    {snapshot.phase !== 'open'
                      ? '결과를 함께 살펴봐요'
                      : everyone
                        ? '모두 냈어요!'
                        : '아직 받는 중이에요'}
                  </p>
                </div>
                <div className="mt-4 h-5 overflow-hidden rounded-full bg-sp-border">
                  <div
                    className={`h-5 rounded-full transition-[width] duration-sp-slow ease-sp-out motion-reduce:transition-none ${
                      everyone ? 'bg-sp-success' : 'bg-sp-accent'
                    }`}
                    style={{ width: `${total ? Math.min(100, (answered / total) * 100) : 0}%` }}
                  />
                </div>
              </section>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="my-auto w-full">
              {snapshot.phase === 'open' && choices.length > 0 && (
                <div className="grid grid-cols-2 gap-6">
                  {choices.map((o, i) => (
                    <div
                      key={o.id}
                      className="flex items-center gap-5 rounded-3xl border-2 border-sp-border bg-sp-card p-7"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-sp-accent text-3xl font-bold text-sp-accent-fg"
                      >
                        {question?.type === 'ox' || traffic
                          ? o.text.slice(0, 1)
                          : String.fromCharCode(65 + i)}
                      </span>
                      <span className="min-w-0 flex-1 break-keep text-4xl leading-snug">
                        {o.text}
                      </span>
                      {'imageUrl' in o && typeof o.imageUrl === 'string' && o.imageUrl && (
                        <img
                          src={o.imageUrl}
                          alt={o.text}
                          className="max-h-40 max-w-[12rem] rounded-2xl object-contain"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {snapshot.phase === 'open' && !scored && choices.length === 0 && (
                <p className="mb-6 text-3xl font-bold text-sp-muted">
                  {showLive ? '지금까지 모인 생각이에요' : '휴대전화에서 생각을 적어 주세요'}
                </p>
              )}

              {showLive && question && (
                <QuestionResponseSummary
                  question={question}
                  responses={snapshot.responsesForCurrent}
                  size="display"
                />
              )}

              {/* 정답이 있는 문항은 정답과 분포를 나란히 둔다 — 한 화면에 같이 보여야
                  "정답은 이거고, 우리 반은 이렇게 갈렸다"가 한 번에 읽힌다. */}
              <div className={data.answer ? 'grid items-start gap-8 xl:grid-cols-2' : ''}>
                {data.answer && (
                  <section className="rounded-3xl border-2 border-sp-accent bg-sp-card p-10">
                    <p className="text-3xl font-bold text-sp-muted">정답</p>
                    <h2 className="mt-2 break-keep text-6xl font-bold text-sp-accent">
                      {data.answer}
                    </h2>
                    {data.explanation && (
                      <p className="mt-6 break-keep text-3xl leading-relaxed">{data.explanation}</p>
                    )}
                  </section>
                )}

                {snapshot.phase === 'revealed' && question && votes.length === 0 && (
                  <section aria-label="우리 반의 응답">
                    <h2 className="mb-6 text-4xl font-bold">우리 반의 응답</h2>
                    <QuestionResponseSummary
                      question={question}
                      responses={snapshot.responsesForCurrent}
                      size="display"
                    />
                  </section>
                )}
              </div>

              {votes.length > 0 && (
                <section className="mt-12">
                  <h2 className="mb-6 text-4xl font-bold">
                    {voted ? '공감을 많이 받은 생각' : '우리 반이 모은 생각'}
                  </h2>
                  <div className="grid gap-5 md:grid-cols-2">
                    {[...votes]
                      .sort((a, b) => b.count - a.count)
                      .map((vote, rank) => (
                        <article
                          key={vote.id}
                          className={`flex items-start gap-5 rounded-3xl bg-sp-card p-7 ${
                            rank === 0 && voted
                              ? 'border-2 border-sp-highlight'
                              : 'border border-sp-border'
                          }`}
                        >
                          {/* 채운 배경 위 글자색이 보장된 토큰은 sp-accent(+sp-accent-fg) 뿐이다.
                              sp-highlight 는 테마마다 밝기가 달라 테두리·글자색으로만 쓴다. */}
                          <span
                            aria-hidden="true"
                            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full font-mono text-3xl font-bold tabular-nums ${
                              rank === 0 && voted
                                ? 'border-2 border-sp-highlight text-sp-highlight'
                                : 'bg-sp-border text-sp-text'
                            }`}
                          >
                            {vote.count}
                          </span>
                          <p className="min-w-0 flex-1 break-keep text-3xl leading-snug">
                            {vote.text}
                          </p>
                        </article>
                      ))}
                  </div>
                </section>
              )}

              {data.ranking.length > 0 && (
                <section className="mt-12">
                  <h2 className="mb-6 text-4xl font-bold">우리의 도전</h2>
                  <div className="grid gap-6 md:grid-cols-3">
                    {data.ranking.map((r) => (
                      <article
                        key={r.rank + r.nickname}
                        className={`rounded-3xl bg-sp-card p-10 text-center ${
                          r.rank === 1 ? 'border-2 border-sp-highlight' : 'border border-sp-border'
                        }`}
                      >
                        <p
                          className={`font-mono text-5xl font-bold tabular-nums ${
                            r.rank === 1 ? 'text-sp-highlight' : 'text-sp-muted'
                          }`}
                        >
                          {r.rank}위
                        </p>
                        <h3 className="my-5 break-keep text-4xl font-bold">{r.nickname}</h3>
                        <p className="font-mono text-3xl tabular-nums">{r.score}점</p>
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {finished && data.ranking.length === 0 && (
                <p className="mt-10 text-3xl text-sp-muted">
                  오늘 배운 것과 나눈 생각을 돌아보세요.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

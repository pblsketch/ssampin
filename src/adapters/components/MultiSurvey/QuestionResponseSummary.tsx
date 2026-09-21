/**
 * QuestionResponseSummary — 한 문항의 응답을 그림으로 보여 준다.
 *
 * 같은 컴포넌트를 **두 거리에서** 쓴다.
 *  - `compact`(기본): 교사 콘솔·유형 미리보기. 책상에서 30cm 앞.
 *  - `display`: 교실 화면(TV·빔). 교실 맨 뒷자리에서 읽혀야 한다.
 * 그래서 크기를 무작정 키우지 않고 `size` 로 갈라 쓴다 — 한쪽을 키우면 다른 쪽이 망가진다.
 *
 * ⚠️ `bg-sp-accent/10` 같은 투명도 수식은 이 저장소에서 클래스가 생성되지 않아 투명이 된다.
 *    단색 토큰(`bg-sp-border`)이나 `opacity-*` 유틸을 쓴다.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import {
  isAdvancedType,
  isQuadrantAnswer,
  type AdvancedQuestion,
  type QuadrantPoint,
} from '@domain/entities/multiSurvey/AdvancedQuestion';
import {
  parseAdvancedAnswer,
  quadrantIndexOf,
  quadrantLabels,
} from '@domain/rules/advancedQuestionRules';
import { answerLabel } from '@domain/rules/participationRules';
import { tallyWords } from '@domain/rules/wordCloudTally';
import { groupResponsesByChoice } from '@domain/rules/multiSurveyRules';

export type SummarySize = 'compact' | 'display';

/** 거리에 따라 달라지는 값만 모아 둔다. 나머지 모양은 두 거리가 같다. */
const SCALE = {
  compact: {
    gap: 'space-y-3',
    label: 'text-base',
    small: 'text-sm',
    big: 'text-2xl',
    bar: 'h-3',
    badge: 'h-8 w-8 text-sm',
    dot: 'h-4 w-4',
    track: 'h-2',
    card: 'p-3',
    word: (ratio: number) => 18 + 36 * ratio,
  },
  display: {
    // 교실 뒷자리에서 읽히되, 보기 5개가 한 화면에 들어가야 한다 — 글자는 키우고 여백은 조인다.
    gap: 'space-y-3',
    label: 'text-3xl',
    small: 'text-2xl',
    big: 'text-5xl',
    bar: 'h-5',
    badge: 'h-12 w-12 text-2xl',
    dot: 'h-7 w-7',
    track: 'h-4',
    card: 'p-4',
    word: (ratio: number) => 34 + 76 * ratio,
  },
} as const;

/** 보기 순서를 사람이 부르는 이름으로. 학생 휴대폰도 같은 글자를 보여 준다. */
function optionLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/**
 * 교실 화면에 글 카드를 붙일 때 쓰는 아주 작은 기울기.
 * 같은 응답은 늘 같은 각도가 되게 해서, 다시 그릴 때 카드가 들썩이지 않게 한다.
 */
function cardTilt(seed: string): number {
  let hash = 7;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  return (hash % 5) - 2;
}

/** 매트릭스 판을 어디에 그리는가. 판이 정사각형이라 자리마다 한 변을 다르게 묶는다. */
type QuadrantPlace = 'console' | 'classroom' | 'zoom';

const QUADRANT_CELL_NAMES = ['왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래'] as const;

/**
 * 2×2 매트릭스 결과 판.
 *
 * **판은 정사각형인데 화면은 16:9 다.** 폭을 그대로 쓰면 교사 화면에서 세로로 넘쳐 스크롤이
 * 생기고(1,100px 칸에서 판이 1,052px 였다), 높이에 묶으면 교실 화면에서 가로가 텅 빈다.
 * 그래서 **자리마다 한 변을 따로 묶고**, 책상에서 보는 교사 화면에만 [크게 보기]를 둔다.
 * 교실 화면은 아무도 누르지 않으므로(프로젝터) 대신 화면을 좌우로 나눠 판을 키운다.
 */
function QuadrantResult({
  question,
  points,
  place,
}: {
  question: AdvancedQuestion;
  points: readonly QuadrantPoint[];
  place: QuadrantPlace;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!enlarged) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setEnlarged(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [enlarged]);

  const size: SummarySize = place === 'console' ? 'compact' : 'display';
  const s = SCALE[size];
  const set = question.settings;
  const labels = quadrantLabels(question);
  const byCell = [0, 1, 2, 3].map((i) => points.filter((p) => quadrantIndexOf(p) === i));
  const withText = points.some((p) => p.text);
  const nameOf = (i: number) => labels[i]?.trim() || QUADRANT_CELL_NAMES[i]!;

  // 한 변의 최대 길이. 교실 화면은 좌우로 나뉘어 높이를 거의 다 쓴다.
  const side =
    place === 'console'
      ? 'max-w-[520px]'
      : place === 'zoom'
        ? 'max-w-[min(88vw,74vh)]'
        : withText
          ? 'max-w-[42vh]'
          : 'max-w-[60vh]';

  const board = (
    <div className="relative aspect-square w-full rounded-2xl border border-sp-border bg-sp-card">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-sp-border"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-sp-border"
      />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className={`absolute flex max-w-[46%] flex-col gap-0.5 p-3 ${
            i % 2 === 1 ? 'right-0 items-end text-right' : 'left-0 items-start text-left'
          } ${i < 2 ? 'top-0' : 'bottom-0'}`}
        >
          <span className={`font-mono font-bold tabular-nums text-sp-accent ${s.big}`}>
            {byCell[i]?.length ?? 0}
          </span>
          <span className={`break-keep text-sp-muted ${s.small}`}>{nameOf(i)}</span>
        </div>
      ))}
      {points.map((p, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sp-card bg-sp-accent opacity-60 ${s.dot}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
        />
      ))}
    </div>
  );

  const chart = (
    <div className={`mx-auto w-full ${side}`}>
      {set.yMaxLabel && <p className={`text-center font-bold ${s.small}`}>{set.yMaxLabel}</p>}
      <div className="my-2">{board}</div>
      {set.yMinLabel && <p className={`text-center font-bold ${s.small}`}>{set.yMinLabel}</p>}
      <div className={`flex items-center justify-between gap-3 ${s.small}`}>
        <span className="font-bold">{set.xMinLabel}</span>
        {(set.xLabel || set.yLabel) && (
          <span className="text-sp-muted">
            {[set.xLabel && `가로 ${set.xLabel}`, set.yLabel && `세로 ${set.yLabel}`]
              .filter(Boolean)
              .join(' · ')}
          </span>
        )}
        <span className="font-bold">{set.xMaxLabel}</span>
      </div>
      {place === 'console' && (
        <button
          type="button"
          onClick={() => setEnlarged(true)}
          className="mt-3 w-full rounded-xl border border-sp-border bg-sp-card py-2 text-sm font-bold text-sp-muted hover:border-sp-accent hover:text-sp-accent"
        >
          크게 보기
        </button>
      )}
    </div>
  );

  const texts = withText && (
    <div
      className={
        size === 'display'
          ? 'grid grid-cols-2 content-center gap-x-8 gap-y-4'
          : 'mt-6 grid gap-4 sm:grid-cols-2'
      }
    >
      {[0, 1, 2, 3].map((i) =>
        (byCell[i]?.length ?? 0) === 0 ? null : (
          <section key={i}>
            <h3 className={`mb-2 font-bold ${s.label}`}>
              {nameOf(i)}{' '}
              <span className="font-mono tabular-nums text-sp-accent">{byCell[i]?.length}</span>
            </h3>
            <ul className={size === 'display' ? 'space-y-1.5' : 'space-y-2'}>
              {byCell[i]
                ?.filter((p) => p.text)
                .map((p, n) => (
                  <li
                    key={n}
                    className={`break-keep rounded-xl border border-sp-border bg-sp-card ${s.card} ${s.small}`}
                  >
                    {p.text}
                  </li>
                ))}
            </ul>
          </section>
        ),
      )}
    </div>
  );

  return (
    <div className={withText && place !== 'console' ? 'grid grid-cols-2 items-center gap-10' : ''}>
      <div>{chart}</div>
      {texts}
      {enlarged &&
        createPortal(
          // 유리 모드의 backdrop-filter 가 position:fixed 를 가두므로 body 로 내보낸다.
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${question.text} — 결과 판 크게 보기`}
            className="fixed inset-0 z-[90] flex flex-col bg-sp-bg p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-6">
              <h2 className="min-w-0 break-keep text-xl font-bold">{question.text}</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setEnlarged(false)}
                className="shrink-0 rounded-xl border border-sp-border bg-sp-card px-4 py-2 font-bold"
              >
                닫기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <QuadrantResult question={question} points={points} place="zoom" />
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function QuestionResponseSummary({
  question: q,
  responses,
  size = 'compact',
}: {
  question: Question;
  responses: readonly Response[];
  size?: SummarySize;
}) {
  const s = SCALE[size];
  if (!responses.length)
    return <p className={`py-6 text-sp-muted ${s.label}`}>아직 응답이 없어요.</p>;

  if (q.type === 'wordcloud') {
    const words = tallyWords(responses.map((r) => (typeof r.answer === 'number' ? [] : r.answer)));
    const max = Math.max(1, ...words.map((w) => w.count));
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-4 py-8">
        {words.map((word) => (
          <span
            key={word.normalized}
            className="font-bold text-sp-accent"
            style={{ fontSize: `${s.word(word.count / max)}px`, lineHeight: 1.1 }}
            title={`${word.count}명`}
          >
            {word.word}
            <span className={`ml-1 align-super text-sp-muted ${s.small}`}>{word.count}</span>
          </span>
        ))}
      </div>
    );
  }

  if (
    q.type === 'multiple' ||
    q.type === 'single-choice' ||
    q.type === 'multi-choice' ||
    q.type === 'ox'
  ) {
    const options =
      q.type === 'multiple'
        ? q.choices
        : q.type === 'ox'
          ? [
              { id: 'O', text: 'O' },
              { id: 'X', text: 'X' },
            ]
          : q.options;
    // 정답을 아는 문항에서만 정답을 강조한다. 의견 문항에는 정답 개념이 없다.
    const correctIds: readonly string[] =
      q.type === 'multiple' ? q.correctChoiceIds : q.type === 'ox' ? [q.correctAnswer] : [];
    const traffic = q.presentation === 'trafficlight';
    return (
      <div className={s.gap}>
        {groupResponsesByChoice(responses, q).map((row) => {
          const index = options.findIndex((o) => o.id === row.choiceId);
          const correct = correctIds.includes(row.choiceId);
          return (
            <div
              key={row.choiceId}
              className={`rounded-2xl border bg-sp-card ${s.card} ${
                correct ? 'border-2 border-sp-accent' : 'border-sp-border'
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={`flex shrink-0 items-center justify-center rounded-full font-bold ${s.badge} ${
                    correct ? 'bg-sp-accent text-sp-accent-fg' : 'bg-sp-border text-sp-text'
                  }`}
                >
                  {q.type === 'ox' || traffic
                    ? (options[index]?.text ?? '?').slice(0, 1)
                    : optionLetter(Math.max(0, index))}
                </span>
                <p className={`min-w-0 flex-1 break-keep ${s.label}`}>
                  {q.type === 'ox'
                    ? ['맞아요', '아니에요'][index]
                    : (options[index]?.text ?? row.choiceId)}
                  {correct && (
                    <span className={`ml-2 font-bold text-sp-accent ${s.small}`}>· 정답</span>
                  )}
                </p>
                <span className={`shrink-0 text-sp-muted ${s.label}`}>
                  <span className="font-mono tabular-nums">{row.count}</span>명
                </span>
              </div>
              <div className={`mt-2 overflow-hidden rounded-full bg-sp-border ${s.bar}`}>
                <div
                  className={`${s.bar} rounded-full transition-[width] duration-sp-slow ease-sp-out motion-reduce:transition-none ${
                    correct ? 'bg-sp-accent' : 'bg-sp-muted'
                  }`}
                  style={{ width: `${row.ratio * 100}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (isAdvancedType(q.type)) {
    const question = q as AdvancedQuestion;
    const values = responses
      .map((r) => parseAdvancedAnswer(question, r.answer))
      .filter((v) => v !== null);
    if (question.type === 'pin')
      return (
        <div className="relative">
          <img src={question.settings.imageUrl} alt="학생이 표시한 위치" className="w-full" />
          {values.map((v, i) => {
            const p = v as Record<string, number>;
            return (
              <span
                key={i}
                className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sp-card bg-sp-accent px-2 font-bold text-sp-accent-fg ${s.small}`}
                style={{ left: `${p.x! * 100}%`, top: `${p.y! * 100}%` }}
                aria-label={`응답 ${i + 1}: 가로 ${Math.round(p.x! * 100)}%, 세로 ${Math.round(p.y! * 100)}%`}
              >
                +
              </span>
            );
          })}
        </div>
      );
    if (question.type === 'quadrant')
      return (
        <QuadrantResult
          question={question}
          points={values.flatMap((v) => (isQuadrantAnswer(v) ? [...v] : []))}
          place={size === 'display' ? 'classroom' : 'console'}
        />
      );
    if (question.type === 'valueline') {
      const set = question.settings;
      const span = set.max - set.min || 1;
      const at = (n: number) => `${Math.max(0, Math.min(100, ((n - set.min) / span) * 100))}%`;
      const read = (key: string) =>
        values
          .map((v) => (v as Record<string, number>)[key])
          .filter((n): n is number => typeof n === 'number');
      const mean = (ns: readonly number[]) => ns.reduce((a, b) => a + b, 0) / (ns.length || 1);
      const named = set.items.length > 1 || !!set.items[0]?.text.trim();
      return (
        <div className={size === 'display' ? 'space-y-12' : 'space-y-8'}>
          {set.items.map((item) => {
            const ns = read(`${item.id}:x`);
            const avg = mean(ns);
            return (
              <div key={item.id}>
                {named && <p className={`font-bold ${s.label}`}>{item.text}</p>}
                {set.xLabel && <p className={`text-sp-muted ${s.small}`}>{set.xLabel}</p>}
                <div className={`relative my-7 rounded-full bg-sp-border ${s.track}`}>
                  {ns.map((n, i) => (
                    <span
                      key={i}
                      aria-hidden="true"
                      className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sp-card bg-sp-accent opacity-60 ${s.dot}`}
                      style={{ left: at(n) }}
                    />
                  ))}
                  <span
                    aria-hidden="true"
                    className={`absolute -translate-x-1/2 rounded-full bg-sp-accent ${
                      size === 'display' ? '-top-4 h-12 w-2' : '-top-3 h-8 w-1'
                    }`}
                    style={{ left: at(avg) }}
                  />
                </div>
                <div className={`flex items-center justify-between gap-3 ${s.small}`}>
                  <span className="font-bold">{set.xMinLabel || set.min}</span>
                  <strong className={`text-sp-accent ${s.label}`}>
                    평균 <span className="font-mono tabular-nums">{avg.toFixed(1)}</span> ·{' '}
                    <span className="font-mono tabular-nums">{ns.length}</span>명
                  </strong>
                  <span className="font-bold">{set.xMaxLabel || set.max}</span>
                </div>
              </div>
            );
          })}
        </div>
      );
    }
    if (question.type === 'matrix')
      return (
        <>
          <div className="relative m-6 aspect-square rounded-2xl border-b-2 border-l-2 border-sp-border bg-sp-card">
            {question.settings.items.map((item) => {
              const n = values.length || 1;
              const x =
                values.reduce<number>(
                  (sum, v) => sum + (v as Record<string, number>)[item.id + ':x']!,
                  0,
                ) / n;
              const y =
                values.reduce<number>(
                  (sum, v) => sum + (v as Record<string, number>)[item.id + ':y']!,
                  0,
                ) / n;
              const range = question.settings.max - question.settings.min;
              return (
                <span
                  key={item.id}
                  className={`absolute -translate-x-1/2 rounded-lg bg-sp-accent p-1 text-sp-accent-fg ${s.small}`}
                  style={{
                    left: `${(100 * (x - question.settings.min)) / range}%`,
                    bottom: `${(100 * (y - question.settings.min)) / range}%`,
                  }}
                >
                  {item.text} ({x.toFixed(1)}, {y.toFixed(1)})
                </span>
              );
            })}
          </div>
          <p className={`text-sp-muted ${s.small}`}>
            가로: {question.settings.xLabel} · 세로: {question.settings.yLabel} · 항목별 평균
          </p>
        </>
      );
    if (['ranking', 'order', 'allocation', 'rating'].includes(question.type))
      return (
        <div className={s.gap}>
          {question.settings.items.map((item, i) => {
            const avg =
              values.reduce<number>(
                (sum, v) =>
                  sum +
                  (Array.isArray(v)
                    ? v.indexOf(item.id) + 1
                    : ((v as Record<string, number>)[item.id] ?? 0)),
                0,
              ) / (values.length || 1);
            const max =
              question.type === 'allocation'
                ? question.settings.total
                : ['ranking', 'order'].includes(question.type)
                  ? question.settings.items.length
                  : question.settings.max;
            const ranked = ['ranking', 'order'].includes(question.type);
            return (
              <div
                key={item.id}
                className={`rounded-2xl border border-sp-border bg-sp-card ${s.card}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex shrink-0 items-center justify-center rounded-full bg-sp-border font-bold text-sp-text ${s.badge}`}
                  >
                    {i + 1}
                  </span>
                  <p className={`min-w-0 flex-1 break-keep ${s.label}`}>{item.text}</p>
                  <strong className={`shrink-0 font-mono tabular-nums text-sp-accent ${s.label}`}>
                    {avg.toFixed(1)}
                    {ranked ? '위' : '점'}
                  </strong>
                </div>
                <div className={`mt-3 overflow-hidden rounded-full bg-sp-border ${s.bar}`}>
                  <div
                    className={`${s.bar} rounded-full bg-sp-accent transition-[width] duration-sp-slow ease-sp-out motion-reduce:transition-none`}
                    style={{
                      width: `${Math.max(0, Math.min(100, (question.type === 'rating' ? (avg - question.settings.min) / (max - question.settings.min) : avg / max) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      );
    if (question.type === 'numeric') {
      const ns = values.filter((v): v is number => typeof v === 'number');
      return (
        <div>
          <p className={`mb-4 font-bold ${s.big}`}>
            평균{' '}
            <span className="font-mono tabular-nums text-sp-accent">
              {(ns.reduce((a, b) => a + b, 0) / (ns.length || 1)).toFixed(1)}
            </span>
            {question.settings.unit}
          </p>
          <div className="flex flex-wrap gap-2">
            {ns.map((n, i) => (
              <span
                key={i}
                className={`rounded-xl border border-sp-border bg-sp-card font-mono tabular-nums ${s.card} ${s.label}`}
              >
                {n}
                {question.settings.unit}
              </span>
            ))}
          </div>
        </div>
      );
    }
  }

  return (
    <div className={size === 'display' ? 'flex flex-wrap justify-center gap-5' : 'grid gap-3'}>
      {responses.map((r) => (
        <article
          key={r.id}
          className={`rounded-2xl border border-sp-border bg-sp-card ${s.card} ${
            size === 'display'
              ? 'sp-floating-card max-w-[32rem] shadow-sp-md motion-reduce:animate-none'
              : ''
          }`}
          style={
            size === 'display'
              ? ({ '--sp-card-rotate': `${cardTilt(r.id)}deg` } as CSSProperties)
              : undefined
          }
        >
          <p className={`break-keep ${s.label}`}>{answerLabel(q, r.answer)}</p>
          {r.reason && <p className={`mt-2 text-sp-muted ${s.small}`}>{r.reason}</p>}
        </article>
      ))}
    </div>
  );
}

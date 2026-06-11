/**
 * ShareAnswerReveal — 정답 공개 화면.
 *
 * - 분포 막대 애니메이션 (ShareDistributionBar 재사용)
 * - 정답 카드 flash (accent 배경 깜빡임 0.6s)
 * - 해설 fade-in (sp-duration-slow * 3)
 * - sp-* 토큰: sp-accent / sp-muted / sp-text / sp-duration-slow
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Question } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import { ShareDistributionBar } from './ShareDistributionBar';

interface ShareAnswerRevealProps {
  readonly question: Question;
  readonly responses: readonly Response[];
  /** T02 해설 노출 토글 */
  readonly revealExplanation: boolean;
}

interface DistributionItem {
  readonly id: string;
  readonly label: string;
  readonly text?: string;
  readonly count: number;
  readonly percentage: number;
  readonly isCorrect: boolean;
}

function buildDistribution(
  question: Question,
  responses: readonly Response[],
): readonly DistributionItem[] {
  // OX
  if (question.type === 'ox') {
    const counts: Record<'O' | 'X', number> = { O: 0, X: 0 };
    for (const r of responses) {
      const ans = r.answer;
      if (ans === 'O' || ans === 'X') counts[ans] += 1;
    }
    const total = counts.O + counts.X;
    const pct = (n: number): number => (total === 0 ? 0 : Math.round((n / total) * 100));
    return [
      {
        id: 'O',
        label: 'O',
        count: counts.O,
        percentage: pct(counts.O),
        isCorrect: question.correctAnswer === 'O',
      },
      {
        id: 'X',
        label: 'X',
        count: counts.X,
        percentage: pct(counts.X),
        isCorrect: question.correctAnswer === 'X',
      },
    ];
  }

  // 객관식 (multiple, single-choice, multi-choice)
  if (
    question.type === 'multiple' ||
    question.type === 'single-choice' ||
    question.type === 'multi-choice'
  ) {
    const optList = question.type === 'multiple' ? question.choices : question.options;
    const correctIds = question.type === 'multiple' ? question.correctChoiceIds : [];
    const counts = new Map<string, number>();
    for (const opt of optList) counts.set(opt.id, 0);
    for (const r of responses) {
      const ans = r.answer;
      if (Array.isArray(ans)) {
        for (const id of ans) {
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
      } else if (typeof ans === 'string') {
        counts.set(ans, (counts.get(ans) ?? 0) + 1);
      }
    }
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const pct = (n: number): number => (total === 0 ? 0 : Math.round((n / total) * 100));
    return optList.map((opt, idx) => ({
      id: opt.id,
      label: `${idx + 1}`,
      text: opt.text,
      count: counts.get(opt.id) ?? 0,
      percentage: pct(counts.get(opt.id) ?? 0),
      isCorrect: correctIds.includes(opt.id),
    }));
  }

  // 척도/단답/서술 등은 분포 막대 미지원 (텍스트 응답 요약은 콘솔에서)
  return [];
}

function getCorrectAnswerText(question: Question): string {
  switch (question.type) {
    case 'ox':
      return question.correctAnswer;
    case 'multiple': {
      const labels = question.choices
        .map((c, idx) => ({ idx, id: c.id, text: c.text }))
        .filter((c) => question.correctChoiceIds.includes(c.id))
        .map((c) => `${c.idx + 1}. ${c.text}`);
      return labels.join(' / ');
    }
    case 'short':
    case 'blank':
      return question.acceptedAnswers.join(' / ');
    case 'description':
      return `${question.minLength}~${question.maxLength}자 이상의 서술`;
    default:
      return '';
  }
}

function ShareAnswerRevealImpl({
  question,
  responses,
  revealExplanation,
}: ShareAnswerRevealProps): JSX.Element {
  const distribution = useMemo(() => buildDistribution(question, responses), [question, responses]);
  const correctText = useMemo(() => getCorrectAnswerText(question), [question]);

  // 정답 카드 flash: 마운트 직후 1회 깜빡임. prefers-reduced-motion 시 미적용.
  const [flashOn, setFlashOn] = useState<boolean>(true);
  // 해설 fade-in 상태
  const [explanationVisible, setExplanationVisible] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setFlashOn(false);
      setExplanationVisible(true);
      return;
    }
    const flashTimer = window.setTimeout(() => setFlashOn(false), 600);
    const explanationTimer = window.setTimeout(() => setExplanationVisible(true), 700);
    return () => {
      window.clearTimeout(flashTimer);
      window.clearTimeout(explanationTimer);
    };
  }, [question.id]);

  return (
    <section
      className="flex h-full w-full flex-col gap-8 bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="정답 공개 화면"
    >
      {/* 정답 카드 (flash) */}
      <div
        className={`flex items-center gap-6 rounded-sp-xl p-8 transition-colors ${
          flashOn ? 'bg-sp-accent' : 'bg-sp-card border border-sp-accent'
        }`}
        style={{
          transitionDuration: 'var(--sp-duration-slow)',
        }}
        role="status"
        aria-live="polite"
      >
        <span
          className="font-sp-bold"
          style={{
            fontSize: 36,
            color: flashOn ? 'var(--sp-accent-fg)' : 'var(--sp-accent)',
          }}
        >
          정답
        </span>
        <span
          className="font-sp-bold break-keep"
          style={{
            fontSize: 48,
            lineHeight: 1.3,
            color: flashOn ? 'var(--sp-accent-fg)' : 'var(--sp-text)',
          }}
        >
          {correctText.length > 0 ? correctText : '학생 응답을 확인하세요'}
        </span>
      </div>

      {/* 분포 막대 */}
      <div className="flex flex-col gap-6">
        {distribution.length === 0 ? (
          <p className="font-sp-medium text-sp-muted" style={{ fontSize: 28 }}>
            텍스트 응답입니다. 교사 콘솔에서 응답을 확인하세요.
          </p>
        ) : (
          distribution.map((item) => (
            <ShareDistributionBar
              key={item.id}
              label={item.label}
              text={item.text}
              count={item.count}
              percentage={item.percentage}
              isCorrect={item.isCorrect}
            />
          ))
        )}
      </div>

      {/* 해설 (fade-in) */}
      {revealExplanation &&
      question.explanation !== undefined &&
      question.explanation.length > 0 ? (
        <div
          className="rounded-sp-xl bg-sp-card p-8"
          style={{
            opacity: explanationVisible ? 1 : 0,
            transition: 'opacity 600ms var(--sp-ease-out)',
          }}
          role="note"
          aria-label="해설"
        >
          <p className="mb-3 font-sp-semibold text-sp-muted" style={{ fontSize: 24 }}>
            해설
          </p>
          <p
            className="break-keep font-sp-medium text-sp-text"
            style={{ fontSize: 32, lineHeight: 1.45 }}
          >
            {question.explanation}
          </p>
        </div>
      ) : null}
    </section>
  );
}

export const ShareAnswerReveal = memo(ShareAnswerRevealImpl);

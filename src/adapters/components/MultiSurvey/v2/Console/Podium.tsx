/**
 * Podium — 1·2·3등 시상대.
 *
 * - 3등 → 2등 → 1등 순서로 스태거 bounce 등장 (sp-duration-slow + sp-ease-out).
 * - prefers-reduced-motion 시 즉시 표시.
 * - 1등에 sp-highlight, 2·3등에 sp-accent.
 *
 * sp-* 토큰: sp-highlight / sp-accent / sp-card / sp-text / sp-duration-slow / sp-ease-out
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Question } from '@domain/entities/multiSurvey/Question';
import { isQuizType } from '@domain/entities/multiSurvey/Question';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';
import { calcAccuracy } from '@domain/rules/multiSurveyRules';
import { PodiumEntry } from './PodiumEntry';

interface PodiumProps {
  readonly students: readonly StudentProfile[];
  readonly responses: readonly Response[];
  readonly questions: readonly Question[];
}

interface RankedStudent {
  readonly studentId: string;
  readonly nickname: string;
  readonly score: number;
  readonly accuracy: number;
  readonly correctCount: number;
  readonly quizCount: number;
  readonly avatarKey: string;
}

function rankStudents(
  students: readonly StudentProfile[],
  responses: readonly Response[],
  questions: readonly Question[],
): readonly RankedStudent[] {
  const quizIds = new Set(questions.filter((q) => isQuizType(q.type)).map((q) => q.id));
  const ranked = students.map<RankedStudent>((s) => {
    const myResponses = responses.filter((r) => r.studentId === s.studentId);
    const myQuiz = myResponses.filter((r) => quizIds.has(r.questionId));
    return {
      studentId: s.studentId,
      nickname: s.nickname,
      avatarKey: s.avatarKey,
      score: myResponses.reduce((sum, r) => sum + r.scoreEarned, 0),
      accuracy: calcAccuracy(myQuiz),
      correctCount: myQuiz.filter((r) => r.isCorrect === true).length,
      quizCount: myQuiz.length,
    };
  });
  return ranked
    .slice()
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return a.nickname.localeCompare(b.nickname);
    })
    .slice(0, 3);
}

// Phase B B.7 S2-C: addEventListener 추가 — 런타임 reduced-motion 설정 변경 반응
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function PodiumImpl({ students, responses, questions }: PodiumProps): JSX.Element {
  const top3 = useMemo(
    () => rankStudents(students, responses, questions),
    [students, responses, questions],
  );
  const reduced = usePrefersReducedMotion();
  const [step, setStep] = useState(reduced ? 3 : 0);

  useEffect(() => {
    if (reduced) {
      setStep(3);
      return;
    }
    setStep(0);
    // 3→2→1 순서로 등장 (각 200ms 간격)
    const timers: number[] = [];
    [1, 2, 3].forEach((s, i) => {
      timers.push(window.setTimeout(() => setStep(s), 200 + i * 220));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced, top3.length]);

  // 시상대 시각 배치 — 가운데 1등, 좌 2등, 우 3등. 스태거 등장 순서는 3→2→1.
  const rankToOrder: Record<number, number> = { 2: 0, 1: 1, 3: 2 };
  const ordered = top3
    .map((s, i) => ({ entry: s, rank: (i + 1) as 1 | 2 | 3 }))
    .sort((a, b) => (rankToOrder[a.rank] ?? 0) - (rankToOrder[b.rank] ?? 0));

  const visibleFor = (rank: 1 | 2 | 3): boolean => {
    // step 1 → 3등 보임, step 2 → 2,3등 보임, step 3 → 1,2,3 모두 보임
    return rank >= 4 - step;
  };

  return (
    <section
      className="flex h-full w-full flex-col items-center justify-center gap-8"
      aria-label="최종 결과 시상대"
    >
      <h2 className="font-sp-bold text-sp-text" style={{ fontSize: 36 }}>
        최종 결과
      </h2>
      {top3.length === 0 ? (
        <span className="font-sp-medium text-sp-text" style={{ fontSize: 18 }}>
          결과가 없습니다.
        </span>
      ) : (
        <div className="grid w-full max-w-4xl grid-cols-3 items-end gap-6">
          {ordered.map(({ entry, rank }) => {
            const visible = visibleFor(rank);
            const heightPx = rank === 1 ? 360 : rank === 2 ? 320 : 290;
            const style: React.CSSProperties = reduced
              ? { minHeight: heightPx }
              : {
                  minHeight: heightPx,
                  transition:
                    'transform var(--sp-duration-slow) var(--sp-ease-out), opacity var(--sp-duration-slow) var(--sp-ease-out)',
                  transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
                  opacity: visible ? 1 : 0,
                };
            const accuracy = entry.quizCount > 0 ? entry.accuracy : undefined;
            return (
              <div key={entry.studentId} className="flex" style={style}>
                <PodiumEntry
                  rank={rank}
                  nickname={entry.nickname}
                  score={entry.score}
                  accuracy={accuracy}
                  correctCount={entry.quizCount > 0 ? entry.correctCount : undefined}
                  quizCount={entry.quizCount > 0 ? entry.quizCount : undefined}
                  avatarSeed={entry.avatarKey}
                />
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export const Podium = memo(PodiumImpl);

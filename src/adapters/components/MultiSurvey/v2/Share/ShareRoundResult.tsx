/**
 * ShareRoundResult — 중간 순위 (T10 문항별 점수 확인 ON 시 표시).
 *
 * - 36px 폰트로 1~10등 행 노출
 * - 행 스태거 fade-in (50ms 간격, prefers-reduced-motion 시 즉시)
 * - sp-* 토큰: sp-card / sp-text / sp-accent / sp-highlight
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface ShareRoundResultProps {
  readonly students: readonly StudentProfile[];
  readonly responses: readonly Response[];
  /** 1-based 현재 문항 번호 */
  readonly questionNumber: number;
  /** 전체 문항 수 */
  readonly totalQuestions: number;
  /** 표시할 최대 학생 수 (기본 10) */
  readonly displayLimit?: number;
}

interface RankRow {
  readonly rank: number;
  readonly studentId: string;
  readonly nickname: string;
  readonly score: number;
  readonly avatarKey: string;
}

function computeRanks(
  students: readonly StudentProfile[],
  responses: readonly Response[],
  displayLimit: number,
): readonly RankRow[] {
  const totals = new Map<string, number>();
  for (const s of students) totals.set(s.studentId, 0);
  for (const r of responses) {
    totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + r.scoreEarned);
  }
  const rows = students
    .map((s) => ({
      studentId: s.studentId,
      nickname: s.nickname,
      score: totals.get(s.studentId) ?? 0,
      avatarKey: s.avatarKey,
    }))
    .sort((a, b) => b.score - a.score);

  return rows.slice(0, displayLimit).map((row, idx) => ({
    rank: idx + 1,
    studentId: row.studentId,
    nickname: row.nickname,
    score: row.score,
    avatarKey: row.avatarKey,
  }));
}

function ShareRoundResultImpl({
  students,
  responses,
  questionNumber,
  totalQuestions,
  displayLimit = 10,
}: ShareRoundResultProps): JSX.Element {
  const rows = useMemo(
    () => computeRanks(students, responses, displayLimit),
    [students, responses, displayLimit],
  );

  const [revealedRows, setRevealedRows] = useState<number>(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      setRevealedRows(rows.length);
      return;
    }
    setRevealedRows(0);
    const timers: number[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const t = window.setTimeout(
        () => {
          setRevealedRows((prev) => Math.max(prev, i + 1));
        },
        50 * (i + 1),
      );
      timers.push(t);
    }
    return () => {
      for (const t of timers) window.clearTimeout(t);
    };
  }, [rows.length]);

  return (
    <section
      className="flex h-full w-full flex-col gap-10 bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="중간 순위"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="font-sp-bold text-sp-text" style={{ fontSize: 48 }}>
          중간 순위
        </h2>
        <span className="font-sp-semibold text-sp-muted" style={{ fontSize: 28 }}>
          문항 {questionNumber} / {totalQuestions} 완료
        </span>
      </div>

      <ol className="flex flex-1 flex-col gap-3" role="list" aria-label="현재 순위표">
        {rows.length === 0 ? (
          <li
            className="rounded-sp-xl bg-sp-card p-8 text-center font-sp-medium text-sp-muted"
            style={{ fontSize: 28 }}
          >
            아직 응답이 없습니다
          </li>
        ) : (
          rows.map((row, idx) => {
            const isTop3 = row.rank <= 3;
            const revealed = idx < revealedRows;
            return (
              <li
                key={row.studentId}
                className={`flex items-center gap-6 rounded-sp-xl bg-sp-card px-8 py-4 shadow-sp-sm ${
                  isTop3 ? 'border-l-8 border-sp-highlight' : ''
                }`}
                style={{
                  opacity: revealed ? 1 : 0,
                  transform: revealed ? 'translateY(0)' : 'translateY(8px)',
                  transition:
                    'opacity 200ms var(--sp-ease-out), transform 200ms var(--sp-ease-out)',
                }}
              >
                <span
                  className={`flex items-center justify-center rounded-sp-pill font-sp-bold ${
                    isTop3 ? 'bg-sp-highlight text-sp-bg' : 'bg-sp-muted/15 text-sp-text'
                  }`}
                  style={{ width: 64, height: 64, fontSize: 32 }}
                  aria-label={`${row.rank}등`}
                >
                  {row.rank}
                </span>
                <span className="font-sp-semibold text-sp-text" style={{ fontSize: 36 }}>
                  {row.nickname}
                </span>
                <span className="ml-auto flex items-baseline gap-3">
                  <span className="font-sp-bold text-sp-accent" style={{ fontSize: 40 }}>
                    {row.score}
                  </span>
                  <span className="font-sp-semibold text-sp-text" style={{ fontSize: 28 }}>
                    점
                  </span>
                </span>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}

export const ShareRoundResult = memo(ShareRoundResultImpl);

/**
 * PodiumEntry — 단일 시상대 카드 (1·2·3등).
 *
 * - 아바타 + 닉네임 + 점수 + 정답률 (DN-02; quiz 응답이 0건이면 정답률 표시 생략).
 * - 1등은 sp-highlight, 2·3등은 sp-accent.
 *
 * sp-* 토큰: sp-card / sp-text / sp-highlight / sp-accent
 */

import { memo } from 'react';

interface PodiumEntryProps {
  readonly rank: 1 | 2 | 3;
  readonly nickname: string;
  readonly score: number;
  /** 정답률 0~1. quiz 응답이 0건이면 undefined (DN-02) */
  readonly accuracy?: number;
  /** 정답 수 / 전체 quiz 수 (정답률 부연 표시용) */
  readonly correctCount?: number;
  readonly quizCount?: number;
  /** 아바타 표시 키 (앞 1글자 fallback) */
  readonly avatarSeed?: string;
}

function PodiumEntryImpl({
  rank,
  nickname,
  score,
  accuracy,
  correctCount,
  quizCount,
  avatarSeed,
}: PodiumEntryProps): JSX.Element {
  const isChampion = rank === 1;
  const accentClass = isChampion ? 'text-sp-highlight' : 'text-sp-accent';
  const borderClass = isChampion ? 'border-sp-highlight' : 'border-sp-accent';
  const seedChar = (avatarSeed ?? nickname).slice(0, 1) || '?';

  const showAccuracy = accuracy !== undefined && quizCount !== undefined && quizCount > 0;

  return (
    <article
      className={`flex flex-col items-center gap-3 rounded-2xl border-2 ${borderClass} bg-sp-card p-6`}
      aria-label={`${rank}등 ${nickname}`}
    >
      <span className={`font-sp-bold ${accentClass}`} style={{ fontSize: 28 }}>
        {rank}등
      </span>
      <div
        className={`flex items-center justify-center rounded-full font-sp-bold text-[color:var(--sp-accent-fg)] ${isChampion ? 'bg-sp-highlight' : 'bg-sp-accent'}`}
        style={{ width: 84, height: 84, fontSize: 36 }}
        aria-hidden="true"
      >
        {seedChar}
      </div>
      <span className="font-sp-semibold text-sp-text" style={{ fontSize: 22 }}>
        {nickname}
      </span>
      <span className={`font-sp-bold ${accentClass}`} style={{ fontSize: 30 }}>
        {score}점
      </span>
      {showAccuracy && correctCount !== undefined && (
        <span className="font-sp-medium text-sp-text" style={{ fontSize: 14 }}>
          정답률 {Math.round((accuracy ?? 0) * 100)}% ({correctCount}/{quizCount})
        </span>
      )}
    </article>
  );
}

export const PodiumEntry = memo(PodiumEntryImpl);

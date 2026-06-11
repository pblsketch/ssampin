/**
 * SharePodium — 최종 1·2·3등 시상대.
 *
 * - 1등 아바타 96px, 시상대 220px / 2등 160px / 3등 120px (component-tree §4)
 * - CSS confetti (prefers-reduced-motion 시 미적용)
 * - sp-* 토큰: sp-highlight / sp-accent / sp-bg / sp-text / sp-ease-out
 */

import { memo, useEffect, useMemo, useState } from 'react';
import type { Response } from '@domain/entities/multiSurvey/Response';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface SharePodiumProps {
  readonly students: readonly StudentProfile[];
  readonly responses: readonly Response[];
}

interface PodiumEntry {
  readonly rank: 1 | 2 | 3;
  readonly studentId: string;
  readonly nickname: string;
  readonly avatarKey: string;
  readonly score: number;
}

function pickTop3(
  students: readonly StudentProfile[],
  responses: readonly Response[],
): readonly PodiumEntry[] {
  const totals = new Map<string, number>();
  for (const s of students) totals.set(s.studentId, 0);
  for (const r of responses) {
    totals.set(r.studentId, (totals.get(r.studentId) ?? 0) + r.scoreEarned);
  }
  const sorted = students
    .map((s) => ({
      studentId: s.studentId,
      nickname: s.nickname,
      avatarKey: s.avatarKey,
      score: totals.get(s.studentId) ?? 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  return sorted.map((entry, idx) => ({
    rank: (idx + 1) as 1 | 2 | 3,
    studentId: entry.studentId,
    nickname: entry.nickname,
    avatarKey: entry.avatarKey,
    score: entry.score,
  }));
}

// CSS confetti 위치/지연을 결정성 있게 생성 (테스트 안정)
const CONFETTI_COUNT = 40;
const CONFETTI_TOKENS: readonly ('accent' | 'highlight' | 'text')[] = [
  'accent',
  'highlight',
  'text',
];

function tokenToClass(token: 'accent' | 'highlight' | 'text'): string {
  switch (token) {
    case 'accent':
      return 'bg-sp-accent';
    case 'highlight':
      return 'bg-sp-highlight';
    case 'text':
      return 'bg-sp-text';
  }
}

function generateConfetti(): readonly {
  readonly id: number;
  readonly left: number;
  readonly delay: number;
  readonly token: 'accent' | 'highlight' | 'text';
  readonly size: number;
}[] {
  const items: {
    id: number;
    left: number;
    delay: number;
    token: 'accent' | 'highlight' | 'text';
    size: number;
  }[] = [];
  for (let i = 0; i < CONFETTI_COUNT; i += 1) {
    items.push({
      id: i,
      left: (i * 97) % 100, // pseudo random, deterministic
      delay: (i * 53) % 1500,
      token: CONFETTI_TOKENS[i % CONFETTI_TOKENS.length] ?? 'accent',
      size: 8 + ((i * 7) % 8),
    });
  }
  return items;
}

interface PodiumColumnProps {
  readonly entry: PodiumEntry | undefined;
  readonly heightPx: number;
  readonly avatarSizePx: number;
}

function PodiumColumn({ entry, heightPx, avatarSizePx }: PodiumColumnProps): JSX.Element {
  const rankLabel = entry?.rank ?? '-';
  const isFirst = entry?.rank === 1;
  return (
    <div className="flex w-64 flex-col items-center justify-end gap-4">
      {entry !== undefined ? (
        <>
          <div
            className={`flex items-center justify-center rounded-sp-pill font-sp-bold ${
              isFirst ? 'bg-sp-highlight text-sp-bg' : 'bg-sp-accent'
            }`}
            style={{
              width: avatarSizePx,
              height: avatarSizePx,
              fontSize: isFirst ? 40 : 32,
              color: isFirst ? 'var(--sp-bg)' : 'var(--sp-accent-fg)',
            }}
            aria-hidden
          >
            {entry.avatarKey.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-sp-bold text-sp-text" style={{ fontSize: isFirst ? 40 : 32 }}>
            {entry.nickname}
          </span>
          <span className="flex items-baseline gap-2">
            <span className="font-sp-bold text-sp-accent" style={{ fontSize: isFirst ? 40 : 32 }}>
              {entry.score}
            </span>
            <span className="font-sp-semibold text-sp-text" style={{ fontSize: 24 }}>
              점
            </span>
          </span>
        </>
      ) : (
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 28 }}>
          참여자 부족
        </span>
      )}
      <div
        className={`flex w-full items-center justify-center rounded-t-sp-xl ${
          isFirst ? 'bg-sp-highlight' : 'bg-sp-accent'
        }`}
        style={{
          height: heightPx,
          opacity: entry === undefined ? 0.4 : 1,
        }}
        aria-label={entry !== undefined ? `${entry.rank}등 시상대` : '비어있는 시상대'}
      >
        <span
          className="font-sp-bold"
          style={{
            fontSize: isFirst ? 96 : 72,
            color: isFirst ? 'var(--sp-bg)' : 'var(--sp-accent-fg)',
          }}
        >
          {rankLabel}
        </span>
      </div>
    </div>
  );
}

// Phase B B.7 S2-C/D: reduced-motion 핸들러 + Podium 패턴 동일 (Console/Podium 참조)
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

function SharePodiumImpl({ students, responses }: SharePodiumProps): JSX.Element {
  const top3 = useMemo(() => pickTop3(students, responses), [students, responses]);
  const first = top3.find((e) => e.rank === 1);
  const second = top3.find((e) => e.rank === 2);
  const third = top3.find((e) => e.rank === 3);

  const reduced = usePrefersReducedMotion();
  const [confettiActive, setConfettiActive] = useState<boolean>(false);
  const confetti = useMemo(() => generateConfetti(), []);

  // S2-D: 3 → 2 → 1 스태거 입장 (Console/Podium 패턴, 220ms 간격)
  const [step, setStep] = useState<number>(reduced ? 3 : 0);
  useEffect(() => {
    if (reduced) {
      setStep(3);
      return;
    }
    setStep(0);
    const timers: number[] = [];
    [1, 2, 3].forEach((s, i) => {
      timers.push(window.setTimeout(() => setStep(s), 200 + i * 220));
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [reduced, top3.length]);

  useEffect(() => {
    if (reduced) return;
    setConfettiActive(true);
    const stopTimer = window.setTimeout(() => setConfettiActive(false), 4000);
    return () => window.clearTimeout(stopTimer);
  }, [reduced]);

  // step 1 → 3등 / step 2 → 2,3등 / step 3 → 1,2,3
  const visibleFor = (rank: 1 | 2 | 3): boolean => rank >= 4 - step;
  const columnStyle = (rank: 1 | 2 | 3): React.CSSProperties => {
    if (reduced) return {};
    const visible = visibleFor(rank);
    return {
      transition:
        'transform var(--sp-duration-slow) var(--sp-ease-out), opacity var(--sp-duration-slow) var(--sp-ease-out)',
      transform: visible ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
      opacity: visible ? 1 : 0,
    };
  };

  return (
    <section
      className="relative flex h-full w-full flex-col items-center gap-12 overflow-hidden bg-sp-bg px-16 py-12 text-sp-text"
      aria-label="최종 순위 발표"
    >
      <h2
        className="font-sp-bold text-sp-highlight"
        style={{ fontSize: 64, letterSpacing: '0.05em' }}
      >
        최종 순위 발표
      </h2>

      <div className="flex flex-1 items-end justify-center gap-12">
        {/* 2등 좌측 — 스태거 step 2 (S2-D) */}
        <div style={columnStyle(2)}>
          <PodiumColumn entry={second} heightPx={160} avatarSizePx={80} />
        </div>
        {/* 1등 중앙 — 시상대 220px, 아바타 96px — 스태거 step 1 (마지막 등장, S2-D) */}
        <div style={columnStyle(1)}>
          <PodiumColumn entry={first} heightPx={220} avatarSizePx={96} />
        </div>
        {/* 3등 우측 — 스태거 step 3 (첫 등장, S2-D) */}
        <div style={columnStyle(3)}>
          <PodiumColumn entry={third} heightPx={120} avatarSizePx={72} />
        </div>
      </div>

      {/* CSS Confetti */}
      {confettiActive ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {confetti.map((c) => (
            <span
              key={c.id}
              className={`absolute top-[-20px] block rounded-sp-xs ${tokenToClass(c.token)}`}
              style={{
                left: `${c.left}%`,
                width: c.size,
                height: c.size,
                animation: `sp-podium-confetti-fall 3s var(--sp-ease-out) ${c.delay}ms forwards`,
              }}
            />
          ))}
          <style>{`
            @keyframes sp-podium-confetti-fall {
              0% {
                transform: translateY(0) rotate(0deg);
                opacity: 1;
              }
              100% {
                transform: translateY(100vh) rotate(720deg);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      ) : null}
    </section>
  );
}

export const SharePodium = memo(SharePodiumImpl);

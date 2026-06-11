/**
 * StudentPodium — 모바일용 최종 결과.
 *
 * - 내 순위 강조 + 시상대(top 3) 축소판.
 * - 동점자 처리는 부모가 ranking 배열로 결정 (본 컴포넌트는 표시 전용).
 */

import { memo } from 'react';

export interface PodiumEntry {
  readonly studentId: string;
  readonly nickname: string;
  readonly avatarEmoji: string;
  readonly score: number;
  readonly rank: number;
}

interface StudentPodiumProps {
  /** 상위 3명 (rank 1~3 — 동점자 시 더 많을 수 있음) */
  readonly top: readonly PodiumEntry[];
  /** 내 결과 (top에 포함되어도 별도 강조) */
  readonly me: PodiumEntry;
  /** 전체 참가자 수 (n명 중 m등) */
  readonly totalParticipants: number;
}

function StudentPodiumImpl({ top, me, totalParticipants }: StudentPodiumProps): JSX.Element {
  const top3 = top.slice(0, 3);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-start gap-8 px-6 py-10"
      style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
    >
      <h1
        className="font-sp-bold text-sp-text"
        style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 28 }}
      >
        최종 결과
      </h1>

      {/* 시상대 — 1~3등 */}
      <div className="flex w-full max-w-md items-end justify-center gap-3">
        {[1, 2, 3].map((rank) => {
          const entry = top3.find((e) => e.rank === rank);
          const heightPx = rank === 1 ? 140 : rank === 2 ? 110 : 90;
          const color =
            rank === 1
              ? 'var(--color-highlight, #fbbf24)'
              : rank === 2
                ? 'var(--color-muted, #94a3b8)'
                : 'color-mix(in srgb, var(--color-highlight, #fbbf24) 60%, transparent)';
          return (
            <div key={rank} className="flex flex-1 flex-col items-center gap-2">
              {entry !== undefined ? (
                <>
                  <span style={{ fontSize: 36 }} aria-hidden="true">
                    {entry.avatarEmoji}
                  </span>
                  <span
                    className="font-sp-bold text-sp-text"
                    style={{
                      color: 'var(--color-text, #e2e8f0)',
                      fontSize: 14,
                      maxWidth: 80,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.nickname}
                  </span>
                  <span className="font-sp-semibold" style={{ color, fontSize: 12 }}>
                    {entry.score}점
                  </span>
                </>
              ) : (
                <span
                  className="font-sp-medium text-sp-muted"
                  style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
                >
                  —
                </span>
              )}
              <div
                className="flex w-full items-center justify-center rounded-t-2xl font-sp-bold"
                style={{
                  height: heightPx,
                  backgroundColor: color,
                  color: 'var(--color-bg, #0a0e17)',
                  fontSize: 24,
                }}
                aria-label={`${rank}등 시상대`}
              >
                {rank}
              </div>
            </div>
          );
        })}
      </div>

      {/* 내 결과 강조 */}
      <div
        className="flex w-full max-w-md flex-col gap-3 rounded-3xl px-6 py-5"
        role="status"
        aria-label={`나의 최종 순위: ${totalParticipants}명 중 ${me.rank}등, ${me.score}점`}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent, #60a5fa) 18%, transparent)',
          border: '2px solid var(--color-accent, #60a5fa)',
        }}
      >
        <span
          className="font-sp-semibold text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
        >
          나의 결과
        </span>
        <div className="flex items-center gap-4">
          <span style={{ fontSize: 44 }} aria-hidden="true">
            {me.avatarEmoji}
          </span>
          <div className="flex flex-1 flex-col">
            <span
              className="font-sp-bold text-sp-text"
              style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 20 }}
            >
              {me.nickname}
            </span>
            <span
              className="font-sp-medium text-sp-muted"
              style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 13 }}
            >
              {totalParticipants}명 중 {me.rank}등
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span
              className="font-sp-bold"
              style={{ color: 'var(--color-accent, #60a5fa)', fontSize: 32 }}
            >
              {me.score}
            </span>
            <span
              className="font-sp-medium text-sp-muted"
              style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
            >
              점
            </span>
          </div>
        </div>
      </div>

      <p
        className="font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
      >
        수고했어요!
      </p>
    </div>
  );
}

export const StudentPodium = memo(StudentPodiumImpl);

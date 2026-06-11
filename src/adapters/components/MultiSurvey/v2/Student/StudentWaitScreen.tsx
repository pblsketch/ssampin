/**
 * StudentWaitScreen — 학생 대기 화면.
 *
 * - 아바타 idle bob 애니메이션 (prefers-reduced-motion 시 정적).
 * - 탭 시 onWave 콜백 → 부모에서 STUDENT_WAVE IPC 발송 (DN-03).
 * - role="button" + aria-label.
 */

import { memo, useEffect, useState } from 'react';
import type { StudentProfile } from '@domain/entities/multiSurvey/LiveSession';

interface StudentWaitScreenProps {
  readonly profile: StudentProfile;
  readonly avatarEmoji: string;
  /** 탭 시 호출 — 부모가 STUDENT_WAVE IPC 발송 (DN-03) */
  readonly onWave: () => void;
  readonly connectedCount: number;
  readonly message?: string;
}

function StudentWaitScreenImpl({
  profile,
  avatarEmoji,
  onWave,
  connectedCount,
  message,
}: StudentWaitScreenProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);
  const [waveTrigger, setWaveTrigger] = useState<number>(0);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
  }, []);

  const handleWave = (): void => {
    setWaveTrigger((n) => n + 1);
    onWave();
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-8 px-6"
      style={{ backgroundColor: 'var(--color-bg, #0a0e17)' }}
    >
      <button
        type="button"
        onClick={handleWave}
        aria-label={`${profile.nickname} 아바타. 탭하면 선생님께 손을 흔듭니다.`}
        className="relative flex h-40 w-40 items-center justify-center rounded-full transition-transform active:scale-95"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-accent, #60a5fa) 20%, transparent)',
        }}
      >
        <span
          className={reduceMotion ? '' : 'sp-avatar-bob'}
          style={{ fontSize: 96 }}
          aria-hidden="true"
          key={waveTrigger}
        >
          {avatarEmoji}
        </span>
      </button>

      <div className="flex flex-col items-center gap-2">
        <p
          className="font-sp-bold text-sp-text"
          style={{ color: 'var(--color-text, #e2e8f0)', fontSize: 24 }}
        >
          {profile.nickname}
        </p>
        <p
          className="font-sp-medium text-sp-muted"
          style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 14 }}
        >
          {message ?? '곧 시작합니다. 잠시만 기다려주세요.'}
        </p>
      </div>

      <div
        className="flex items-baseline gap-2 font-sp-semibold"
        role="status"
        aria-live="polite"
        style={{ color: 'var(--color-accent, #60a5fa)' }}
      >
        <span style={{ fontSize: 28 }}>{connectedCount}</span>
        <span style={{ fontSize: 14, color: 'var(--color-muted, #94a3b8)' }}>명 입장</span>
      </div>

      <p
        className="font-sp-medium text-sp-muted"
        style={{ color: 'var(--color-muted, #94a3b8)', fontSize: 12 }}
      >
        아바타를 탭하면 선생님께 손을 흔들 수 있어요
      </p>

      <style>{`
        @keyframes sp-avatar-bob-kf {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-8px); }
        }
        .sp-avatar-bob {
          display: inline-block;
          animation: sp-avatar-bob-kf 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

export const StudentWaitScreen = memo(StudentWaitScreenImpl);

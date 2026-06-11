/**
 * AvatarPicker — 학생 아바타 선택 그리드.
 *
 * - 12종 아바타 키를 sp-* 토큰 기반 그리드로 표시.
 * - 선택 시 scale bounce + accent ring (prefers-reduced-motion 시 ring만).
 * - 각 아바타 버튼에 aria-label 필수 (DN-10 접근성).
 *
 * 학생 페이지 컨텍스트 — CSS 변수 fallback HEX 허용 (DN-10 예외).
 */

import { memo, useEffect, useState } from 'react';

/** 12종 아바타 키 — emoji 기반 (Phase B 단순화. Phase C에서 SVG 교체 가능). */
const AVATAR_KEYS: ReadonlyArray<{ key: string; emoji: string; label: string }> = [
  { key: 'cat', emoji: '🐱', label: '고양이' },
  { key: 'dog', emoji: '🐶', label: '강아지' },
  { key: 'fox', emoji: '🦊', label: '여우' },
  { key: 'panda', emoji: '🐼', label: '판다' },
  { key: 'tiger', emoji: '🐯', label: '호랑이' },
  { key: 'rabbit', emoji: '🐰', label: '토끼' },
  { key: 'bear', emoji: '🐻', label: '곰' },
  { key: 'koala', emoji: '🐨', label: '코알라' },
  { key: 'frog', emoji: '🐸', label: '개구리' },
  { key: 'monkey', emoji: '🐵', label: '원숭이' },
  { key: 'penguin', emoji: '🐧', label: '펭귄' },
  { key: 'unicorn', emoji: '🦄', label: '유니콘' },
];

interface AvatarPickerProps {
  readonly selectedKey: string | null;
  readonly onSelect: (key: string) => void;
}

function AvatarPickerImpl({ selectedKey, onSelect }: AvatarPickerProps): JSX.Element {
  const [reduceMotion, setReduceMotion] = useState<boolean>(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setReduceMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div className="grid grid-cols-4 gap-3" role="radiogroup" aria-label="아바타 선택">
      {AVATAR_KEYS.map(({ key, emoji, label }) => {
        const isSelected = selectedKey === key;
        const ringClass = isSelected
          ? 'ring-4 ring-sp-accent bg-sp-accent/20'
          : 'ring-1 ring-sp-border bg-sp-card';
        const animClass = isSelected && !reduceMotion ? 'sp-avatar-bounce' : '';
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={`${label} 아바타`}
            onClick={() => onSelect(key)}
            className={`flex aspect-square items-center justify-center rounded-2xl text-4xl transition-all duration-200 hover:bg-sp-accent/10 ${ringClass} ${animClass}`}
            style={{
              backgroundColor: isSelected
                ? 'color-mix(in srgb, var(--color-accent, #60a5fa) 20%, transparent)'
                : 'var(--color-card, #1a1f2e)',
            }}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
      <style>{`
        @keyframes sp-avatar-bounce-kf {
          0%   { transform: scale(1); }
          40%  { transform: scale(1.15); }
          70%  { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        .sp-avatar-bounce {
          animation: sp-avatar-bounce-kf 300ms var(--sp-ease-out, cubic-bezier(0.16, 1, 0.3, 1));
        }
      `}</style>
    </div>
  );
}

export const AvatarPicker = memo(AvatarPickerImpl);

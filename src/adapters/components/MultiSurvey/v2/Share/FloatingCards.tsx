/**
 * FloatingCards — 교실 화면에서 개방형 응답을 카드로 떠오르게 보여준다.
 *
 * 왜 있나: 주관식·서술형·질문 받기 응답이 목록으로만 쌓이면 교실 뒤에서 읽히지 않고,
 * 반 전체가 같이 읽는 순간이 만들어지지 않는다.
 *
 * 적용 범위(사용자 결정): 교실 공유 창의 주관식·서술형·질문 받기만.
 * 퀴즈 단답형·빈칸은 정답이 그대로 노출되므로 쓰지 않는다.
 *
 * 접근성: `prefers-reduced-motion`이면 움직임 없이 그대로 쌓아 보여준다.
 * sp-* 토큰: sp-card / sp-border / sp-text / sp-duration-slow / sp-ease-out
 */

import { memo, useEffect, useMemo, useState } from 'react';

interface FloatingCardsProps {
  /** 화면에 띄울 응답 문구 (들어온 순서) */
  readonly texts: readonly string[];
  /** 응답이 없을 때 보여줄 안내 */
  readonly emptyLabel?: string;
}

/** 카드가 한 화면에 너무 많아지면 뒤에서 읽히지 않는다 — 최근 것만 남긴다. */
const MAX_CARDS = 12;
/** 카드마다 조금씩 다른 기울기·지연을 주되, 같은 문구는 항상 같은 모양이 되게 한다. */
function stableVariant(text: string, index: number): { rotate: number; delayMs: number } {
  let hash = index * 31;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 997;
  return { rotate: (hash % 7) - 3, delayMs: (hash % 5) * 120 };
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (): void => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

function FloatingCardsImpl({
  texts,
  emptyLabel = '아직 들어온 응답이 없어요.',
}: FloatingCardsProps): JSX.Element {
  const reducedMotion = usePrefersReducedMotion();
  const visible = useMemo(() => texts.slice(-MAX_CARDS), [texts]);

  if (visible.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-sp-xl border border-sp-border bg-sp-card p-10"
        role="status"
      >
        <span className="font-sp-medium text-sp-muted" style={{ fontSize: 32 }}>
          {emptyLabel}
        </span>
      </div>
    );
  }

  return (
    <div
      className="flex h-full w-full flex-wrap content-center items-center justify-center gap-6 overflow-hidden"
      aria-live="polite"
      aria-label="학생 응답"
    >
      {visible.map((text, index) => {
        const { rotate, delayMs } = stableVariant(text, index);
        return (
          <article
            key={`${text}-${index}`}
            className="rounded-sp-xl border border-sp-border bg-sp-card px-8 py-6 shadow-sp-md sp-floating-card"
            style={{
              maxWidth: 520,
              // 기울기는 CSS 변수로 넘긴다 — 등장 애니메이션의 transform이 덮어쓰지 않게.
              ...(reducedMotion
                ? {}
                : ({ '--sp-card-rotate': `${rotate}deg` } as React.CSSProperties)),
              animationDelay: reducedMotion ? undefined : `${delayMs}ms`,
            }}
          >
            <p
              className="break-keep font-sp-semibold text-sp-text"
              style={{ fontSize: 30, lineHeight: 1.35 }}
            >
              {text}
            </p>
          </article>
        );
      })}
    </div>
  );
}

export const FloatingCards = memo(FloatingCardsImpl);

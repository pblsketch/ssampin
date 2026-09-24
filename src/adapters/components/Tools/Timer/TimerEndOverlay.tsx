import { useEffect, useState } from 'react';
import { overtimeSeconds } from '@domain/rules/timerRules';
import { TimerDigits } from './TimerDial';

/**
 * 시간 종료 화면 — 타이머·단계·발표가 같은 모양을 쓴다(ADR-139, spec 2-4, 설계 6장).
 *
 * ★배경은 반드시 **인라인 `var(--sp-bg)`** 로 칠한다. `bg-sp-bg/90` 처럼 sp-* 토큰에
 *   Tailwind 투명도 수식을 붙이면 규칙이 아예 만들어지지 않아 조용히 투명해지고, 뒤의 큰 숫자가
 *   "시간 종료" 글씨와 겹친다(회귀 #82). 깜빡일 때도 color-mix 로 불투명하게 섞는다.
 */

/** 끝난 뒤 흐른 시간을 1초마다 다시 센다. finishedAt 이 없으면 0. */
export function useOvertimeSeconds(finishedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (finishedAt === null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [finishedAt]);
  return finishedAt === null ? 0 : overtimeSeconds(finishedAt, now);
}

/** 끝난 직후 잠깐 깜빡인다(0.3초 간격 6번). */
function useEndFlash(active: boolean): boolean {
  const [count, setCount] = useState(0);
  useEffect(() => {
    setCount(active ? 6 : 0);
  }, [active]);
  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 300);
    return () => clearTimeout(t);
  }, [count]);
  return count > 0 && count % 2 === 0;
}

export function TimerEndOverlay({
  finishedAt,
  title = '시간 종료',
  overtimeStyle = 'large',
  flash = true,
  digitFontSize = 64,
  tone = 'alert',
  actions,
}: {
  /** 0 에 닿은 시각. null 이면 초과 시간을 세지 않는다([발표 마침]). */
  readonly finishedAt: number | null;
  readonly title?: string;
  /** 'large' 타이머·단계, 'small' 발표(작고 흐리게), 'hidden' 발표 교실 화면. */
  readonly overtimeStyle?: 'large' | 'small' | 'hidden';
  readonly flash?: boolean;
  readonly digitFontSize?: number;
  /**
   * 'alert' 시간이 다 됨(빨강). 'calm' 선생님이 끝낸 것([발표 마침]·질문 시간 끝) — 일찍 끝낸 학생이
   * 잘못한 것처럼 보이지 않게 평소 글자색으로 쓴다(ADR-134).
   */
  readonly tone?: 'alert' | 'calm';
  readonly actions: React.ReactNode;
}): JSX.Element {
  const overtime = useOvertimeSeconds(finishedAt);
  const isFlashing = useEndFlash(flash && finishedAt !== null);

  return (
    <div
      role="alert"
      className="absolute inset-0 z-40 rounded-2xl flex flex-col items-center justify-center gap-4 p-6 transition-colors duration-200"
      style={{
        backgroundColor: isFlashing
          ? 'color-mix(in srgb, var(--sp-error) 30%, var(--sp-bg))'
          : 'var(--sp-bg)',
      }}
    >
      <p
        className={`text-5xl md:text-7xl font-bold text-center ${
          tone === 'alert' ? 'text-sp-error' : 'text-sp-text'
        }`}
      >
        {title}
      </p>
      {finishedAt !== null && overtimeStyle === 'large' && (
        <TimerDigits
          seconds={overtime}
          prefix="+"
          fontSize={Math.max(28, digitFontSize * 0.55)}
          colorClassName="text-sp-error"
        />
      )}
      {finishedAt !== null && overtimeStyle === 'small' && overtime > 0 && (
        <TimerDigits seconds={overtime} prefix="+" fontSize={16} colorClassName="text-sp-muted" />
      )}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">{actions}</div>
    </div>
  );
}

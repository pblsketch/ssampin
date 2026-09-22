/**
 * 관찰 기록 응원(ADR-135)의 작은 핀 — 카드 핀 줄·응원 토스트에 쓴다.
 *
 * 그림은 아이콘 모드 핀(`Icon/PinDisc.tsx`)과 같은 스프라이트 시트(`public/sprite-pin.png`,
 * 256px 칸 4열 × 4행, 행 = idle/jump/wave/celebrate)다. PinDisc 를 그대로 쓰지 않는 이유:
 * - PinDisc 는 `?url` 가져오기로 그림 주소를 얻는데, 시험 환경에서 이 가져오기가 풀리지 않는다.
 *   토스트(`common/Toast.tsx`)는 수백 개 시험이 불러오는 모듈이라 거기에 PinDisc 를 넣으면
 *   그 시험이 모두 깨진다. 그래서 사이드바처럼 `BASE_URL` 기준 주소를 쓴다.
 * - 아이콘 모드(별도 창)는 이번에 건드리지 않는다(spec §9).
 *
 * 가만히 있는 자세(idle)와 동작 줄이기 설정이면 프레임을 넘기지 않는다 — 카드 핀 줄은 메인 창·위젯 창에
 * 늘 떠 있으므로 쉬지 않고 다시 그리지 않게 한다. 손 흔들기·만세만 움직인다.
 */
import { useEffect, useState } from 'react';

export type CheerPinState = 'idle' | 'wave' | 'celebrate';

const FRAMES = 4;
const SHEET_ROWS = 4;
const ROW: Record<CheerPinState, number> = { idle: 0, wave: 2, celebrate: 3 };
const FPS: Record<CheerPinState, number> = { idle: 4, wave: 6, celebrate: 8 };
const SPRITE_URL = `${import.meta.env.BASE_URL}sprite-pin.png?v=sprite-20260623`;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}

interface CheerPinProps {
  readonly state: CheerPinState;
  /** 한 변(px) */
  readonly size: number;
}

export function CheerPin({ state, size }: CheerPinProps): JSX.Element {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    setFrame(0);
    if (state === 'idle' || prefersReducedMotion()) return;
    const id = window.setInterval(
      () => setFrame((f) => (f + 1) % FRAMES),
      Math.round(1000 / FPS[state]),
    );
    return () => window.clearInterval(id);
  }, [state]);

  return (
    <span
      aria-hidden="true"
      className="relative inline-block shrink-0 overflow-hidden"
      style={{ width: size, height: size }}
    >
      <img
        src={SPRITE_URL}
        alt=""
        draggable={false}
        className="pointer-events-none select-none"
        style={{
          position: 'absolute',
          width: `${FRAMES * size}px`,
          height: `${SHEET_ROWS * size}px`,
          maxWidth: 'none',
          maxHeight: 'none',
          left: `-${frame * size}px`,
          top: `-${ROW[state] * size}px`,
          imageRendering: 'pixelated',
        }}
      />
    </span>
  );
}

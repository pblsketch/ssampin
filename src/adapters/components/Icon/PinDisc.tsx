/**
 * PinDisc — 아이콘 모드 56×56 펫의 비주얼 컴포넌트 (v2.2.3~ 스프라이트 시트 방식).
 *
 * 기존(v0.7~v2.2.2): 정지 PNG 한 장(`floating-pin.png`)을 CSS로 흔드는 흉내.
 * 현재: sprite-gen 으로 만든 진짜 프레임 애니메이션 스프라이트 시트.
 *   - `public/sprite-pin.png` = 1024×1024, 256px 셀 4열 × 4행
 *   - 행(row) = 동작: 0 idle / 1 jump / 2 wave / 3 celebrate
 *   - 열(col) = 프레임 0~3
 *   값은 sprite-gen `manifest.json.frame_layout` 에서 가져온 런타임 상수(SSoT).
 *   알파에서 프레임을 복원하지 않고 명시 상수를 쓴다.
 *
 * 재생: JS 인터벌로 동작별 fps 에 맞춰 프레임 전진(모든 상태 루프).
 *   동작을 얼마나 보여줄지(=언제 idle 로 되돌릴지)는 IconWindow 가 제어한다.
 *
 * 투명 배경 정책(중요): box-shadow / drop-shadow 금지, 배경 transparent 강제.
 *   transparent BrowserWindow 알파 합성에서 회색 박스가 보이던 이슈 회피.
 *   스프라이트 시트는 알파 위생 검사(scripts/check-icon-alpha.mjs)로
 *   테두리 α=0 · 배경 잔상 0 을 확인했고, imageRendering: pixelated 로 보간을 끈다.
 */
import { useEffect, useState } from 'react';
import type { PinState } from './pinPresence';

// public/sprite-pin.png — 한글/공백 없는 영문 경로(Vite 빌드 안전).
import spriteUrl from '/sprite-pin.png?url';

// 자산 교체 시 dev/브라우저 캐시 무력화용 버전.
const spriteCacheBustedUrl = `${spriteUrl}?v=sprite-20260623`;

// ── manifest.json.frame_layout 유래 상수 ──────────────────────────────
// 시트: 256px 셀 4열(프레임) × 4행(동작), 1024×1024. 화면엔 셀당 DISPLAY 로 축소.
const FRAMES = 4; // 동작당 프레임 수(열)
const SHEET_ROWS = 4; // 시트 행 수
const DISPLAY = 56; // 화면 표시 한 변(px) = w-14 h-14

const ROW: Record<PinState, number> = { idle: 0, jump: 1, wave: 2, celebrate: 3 };
const FPS: Record<PinState, number> = { idle: 4, jump: 8, wave: 6, celebrate: 8 };

interface PinDiscProps {
  hasAlert: boolean;
  state: PinState;
}

export function PinDisc({ hasAlert, state }: PinDiscProps) {
  const [frame, setFrame] = useState(0);

  // 동작이 바뀌면 첫 프레임부터 다시 재생
  useEffect(() => {
    setFrame(0);
  }, [state]);

  // fps 에 맞춰 프레임 전진 (루프)
  useEffect(() => {
    const fps = FPS[state] ?? 4;
    const id = window.setInterval(
      () => {
        setFrame((f) => (f + 1) % FRAMES);
      },
      Math.round(1000 / fps),
    );
    return () => window.clearInterval(id);
  }, [state]);

  return (
    <div
      className="relative w-14 h-14 flex items-center justify-center"
      style={{ background: 'transparent', backgroundColor: 'transparent' }}
      aria-hidden="true"
    >
      {/* 알림 펄스 ring — 평소엔 표시 안 됨. 캐릭터 본체와 분리. */}
      {hasAlert && (
        <div
          className="absolute inset-0 rounded-full ring-2 ring-[#f59e0b] animate-pulse"
          style={{ background: 'transparent', backgroundColor: 'transparent' }}
        />
      )}

      {/*
        스프라이트는 CSS background 가 아니라 <img> 콘텐츠로 그린다.
        아이콘 모드 전역 CSS `body.ssampin-icon-popup * { background: transparent !important }`
        가 background-image 까지 지워버리므로(옛 아이콘이 <img> 라 살아있던 이유), 여기서도
        background 대신 img 를 쓴다.
        56×56 뷰포트(overflow-hidden)로 잘라내고, 1024×1024 시트를 224×224(셀당 56)로 축소한
        img 를 음수 offset 으로 옮겨 활성 프레임 칸만 보인다.
      */}
      <div className="relative z-10 w-14 h-14 overflow-hidden">
        <img
          src={spriteCacheBustedUrl}
          alt=""
          draggable={false}
          className="select-none pointer-events-none"
          style={{
            position: 'absolute',
            width: `${FRAMES * DISPLAY}px`,
            height: `${SHEET_ROWS * DISPLAY}px`,
            // 전역 img { max-width:100% } 류에 눌려 줄어들지 않도록 해제.
            maxWidth: 'none',
            maxHeight: 'none',
            left: `-${frame * DISPLAY}px`,
            top: `-${ROW[state] * DISPLAY}px`,
            // 픽셀아트가 축소 렌더링에서 흐려지지 않도록 보간 끔.
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </div>
  );
}

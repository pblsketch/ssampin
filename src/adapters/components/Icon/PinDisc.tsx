/**
 * PinDisc — 아이콘 모드 56×56 floating 아이콘의 비주얼 컴포넌트 (v2.0.3~).
 *
 * 디자인 결정 (v0.7 — 귀여운 캐릭터 + idle 애니메이션):
 * - 사용자 제공 `public/플로팅 아이콘2.png` 사용 (투명 배경, 표정 있는 파란 핀 캐릭터)
 * - 평상시: pinIdle 애니메이션 (3초 주기, 좌우로 살짝 흔들+숨쉬기)
 * - 호버: pinHoverBounce (0.6초 주기, 통통 점프)
 * - 알림 펄스: 둘레에 amber 링 + animate-pulse (캐릭터 흔들림은 유지)
 * - 별도 배경/disc 없음 (PNG 자체가 투명 배경)
 * - box-shadow / drop-shadow 금지 — transparent BrowserWindow 알파 합성 회색 박스 이슈
 *
 * 이미지 경로: /플로팅 아이콘2.png (public/ 폴더)
 */

// public/floating-pin.png (사용자 제공 캐릭터 PNG, public/플로팅 아이콘2.png의 영문 사본)
// 한글 + 공백 파일명을 Vite import 경로로 쓰면 빌드가 transforming 단계에서 멈추는 이슈 회피.
import floatingIconUrl from '/floating-pin.png?url';

interface PinDiscProps {
  hasAlert: boolean;
  hovered: boolean;
}

export function PinDisc({ hasAlert, hovered }: PinDiscProps) {
  return (
    <div
      className="relative w-14 h-14 flex items-center justify-center"
      style={{ background: 'transparent', backgroundColor: 'transparent' }}
      aria-hidden="true"
    >
      {/* 알림 펄스 ring — 평소엔 표시 안 됨. 캐릭터 본체와 분리되어 흔들림 영향 없음 */}
      {hasAlert && (
        <div
          className="absolute inset-0 rounded-full ring-2 ring-[#f59e0b] animate-pulse"
          style={{ background: 'transparent', backgroundColor: 'transparent' }}
        />
      )}

      {/* 캐릭터 — 호버 시 통통 점프, 평소엔 살짝 흔들 */}
      <img
        src={floatingIconUrl}
        alt=""
        width={56}
        height={56}
        className={[
          'relative z-10 w-14 h-14 select-none pointer-events-none object-contain',
          hovered ? 'animate-pin-hover-bounce' : 'animate-pin-idle',
        ].join(' ')}
        draggable={false}
        style={{
          transformOrigin: 'center bottom',
          background: 'transparent',
          backgroundColor: 'transparent',
        }}
      />
    </div>
  );
}

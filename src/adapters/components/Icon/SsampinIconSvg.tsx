/**
 * SsampinIconSvg — 3D 클레이 피규어 스타일 압정 마스코트.
 *
 * 4가지 상태: idle(기본), active(수업 중), alert(알림), sleep(방과후).
 * viewBox 200x200, 인라인 SVG 그라데이션 + CSS 애니메이션.
 */

export type IconState = 'idle' | 'active' | 'alert' | 'sleep';

interface SsampinIconSvgProps {
  /** 캐릭터 상태 */
  state?: IconState;
  /** px 단위 크기 (width = height). 기본 42 */
  size?: number;
  /** 추가 className */
  className?: string;
}

export function SsampinIconSvg({
  state = 'idle',
  size = 42,
  className = '',
}: SsampinIconSvgProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      style={state === 'sleep' ? { opacity: 0.6 } : undefined}
    >
      <defs>
        <style>{`
          @keyframes sp-blink {
            0%, 90%, 100% { transform: scaleY(1); }
            95% { transform: scaleY(0.05); }
          }
          @keyframes sp-float {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-3px); }
          }
          @keyframes sp-wave {
            0%, 100% { transform: rotate(0deg); }
            30% { transform: rotate(-20deg); }
            60% { transform: rotate(10deg); }
          }
          @keyframes sp-breathe {
            0%, 100% { transform: scaleY(1); }
            50% { transform: scaleY(1.015); }
          }
          @keyframes sp-badge-pulse {
            0%, 100% { r: 7; }
            50% { r: 8.5; }
          }
          @keyframes sp-zzz {
            0% { opacity: 0.7; transform: translate(0,0); }
            100% { opacity: 0; transform: translate(6,-10); }
          }
          .sp-blink { animation: sp-blink 3.5s ease-in-out infinite; }
          .sp-float { animation: sp-float 2.8s ease-in-out infinite; }
          .sp-wave { animation: sp-wave 2.2s ease-in-out infinite; }
          .sp-breathe { animation: sp-breathe 3s ease-in-out infinite; transform-origin: 50% 85%; }
          .sp-badge { animation: sp-badge-pulse 1.2s ease-in-out infinite; }
          .sp-zzz1 { animation: sp-zzz 2.5s ease-out infinite; }
          .sp-zzz2 { animation: sp-zzz 2.5s ease-out 0.8s infinite; }
        `}</style>

        {/* 머리 */}
        <linearGradient id="sp-head-side" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#60B8F6" />
          <stop offset="60%" stopColor="#3B8DE8" />
          <stop offset="100%" stopColor="#2E6FCC" />
        </linearGradient>
        <radialGradient id="sp-head-top" cx="0.45" cy="0.4" r="0.55">
          <stop offset="0%" stopColor="#9DDBFF" />
          <stop offset="50%" stopColor="#5EB4F5" />
          <stop offset="100%" stopColor="#3D8DE6" />
        </radialGradient>
        <radialGradient id="sp-head-shine" cx="0.35" cy="0.35" r="0.3">
          <stop offset="0%" stopColor="white" stopOpacity="0.45" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </radialGradient>

        {/* 몸통 */}
        <linearGradient id="sp-body" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0%" stopColor="#4E9EF0" />
          <stop offset="40%" stopColor="#3580E0" />
          <stop offset="100%" stopColor="#2460BF" />
        </linearGradient>
        <linearGradient id="sp-body-hi" x1="0" y1="0" x2="1" y2="0.5">
          <stop offset="0%" stopColor="#6CB4F7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#3580E0" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sp-body-shadow" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1E4FAA" stopOpacity="0" />
          <stop offset="100%" stopColor="#1A3D8A" stopOpacity="0.35" />
        </linearGradient>

        {/* 팔/발 */}
        <radialGradient id="sp-limb" cx="0.4" cy="0.35" r="0.6">
          <stop offset="0%" stopColor="#5BAAF3" />
          <stop offset="100%" stopColor="#2E6FCC" />
        </radialGradient>
        <radialGradient id="sp-foot" cx="0.4" cy="0.3" r="0.6">
          <stop offset="0%" stopColor="#3D8DE6" />
          <stop offset="100%" stopColor="#1E4FAA" />
        </radialGradient>

        {/* 눈 */}
        <radialGradient id="sp-eye-bg" cx="0.45" cy="0.4" r="0.5">
          <stop offset="0%" stopColor="white" />
          <stop offset="100%" stopColor="#e8edf2" />
        </radialGradient>
        <radialGradient id="sp-pupil" cx="0.55" cy="0.4" r="0.5">
          <stop offset="0%" stopColor="#2a2a4a" />
          <stop offset="100%" stopColor="#0f0f2a" />
        </radialGradient>

        {/* 바닥 그림자 */}
        <radialGradient id="sp-shadow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#1a3060" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#1a3060" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className={state === 'idle' ? 'sp-float' : undefined}>
        {/* 바닥 그림자 */}
        <ellipse cx={100} cy={184} rx={38} ry={8} fill="url(#sp-shadow)" />

        {/* 발 */}
        <ellipse cx={76} cy={173} rx={14} ry={8} fill="url(#sp-foot)" />
        <ellipse cx={124} cy={173} rx={14} ry={8} fill="url(#sp-foot)" />

        {/* 팔 */}
        <Arms state={state} />

        {/* 몸통 */}
        <g className={state === 'idle' ? 'sp-breathe' : undefined}>
          <path d="M 62,82 C 58,110 60,145 70,168 L 130,168 C 140,145 142,110 138,82 Z" fill="url(#sp-body)" />
          <path d="M 62,82 C 58,108 60,140 68,162 L 82,165 C 76,140 72,108 74,82 Z" fill="url(#sp-body-hi)" />
          <path d="M 138,82 C 142,108 140,140 132,162 L 120,165 C 128,140 130,108 128,82 Z" fill="url(#sp-body-shadow)" />
          <ellipse cx={96} cy={130} rx={18} ry={22} fill="#5BAAF3" opacity={0.12} />
        </g>

        {/* 머리 (핀 헤드 원기둥) */}
        <path d="M 44,60 L 44,72 Q 44,86 100,86 Q 156,86 156,72 L 156,60 Q 156,46 100,46 Q 44,46 44,60 Z" fill="url(#sp-head-side)" />
        <path d="M 48,72 Q 48,84 100,84 Q 152,84 152,72 Q 152,80 100,80 Q 48,80 48,72 Z" fill="#1E4FAA" opacity={0.15} />
        <ellipse cx={100} cy={55} rx={56} ry={15} fill="url(#sp-head-top)" />
        <ellipse cx={100} cy={55} rx={56} ry={15} fill="url(#sp-head-shine)" />
        <ellipse cx={100} cy={55} rx={55} ry={14} fill="none" stroke="white" strokeWidth={0.8} opacity={0.2} />

        {/* 얼굴 */}
        <Face state={state} />
      </g>
    </svg>
  );
}

/* ─── 팔 서브컴포넌트 ─── */

function Arms({ state }: { state: IconState }) {
  switch (state) {
    case 'idle':
      return (
        <>
          <g className="sp-wave" style={{ transformOrigin: '60px 112px' }}>
            <ellipse cx={52} cy={112} rx={14} ry={10} fill="url(#sp-limb)" transform="rotate(-25 52 112)" />
            <ellipse cx={49} cy={109} rx={8} ry={5} fill="#7CC4FA" opacity={0.3} transform="rotate(-25 49 109)" />
          </g>
          <g>
            <ellipse cx={148} cy={112} rx={14} ry={10} fill="url(#sp-limb)" transform="rotate(25 148 112)" />
            <ellipse cx={145} cy={109} rx={8} ry={5} fill="#7CC4FA" opacity={0.3} transform="rotate(25 145 109)" />
          </g>
        </>
      );
    case 'active':
      return (
        <>
          <ellipse cx={56} cy={118} rx={12} ry={9} fill="url(#sp-limb)" transform="rotate(-8 56 118)" />
          <ellipse cx={144} cy={118} rx={12} ry={9} fill="url(#sp-limb)" transform="rotate(8 144 118)" />
        </>
      );
    case 'alert':
      return (
        <>
          <ellipse cx={46} cy={92} rx={14} ry={10} fill="url(#sp-limb)" transform="rotate(-40 46 92)" />
          <ellipse cx={44} cy={89} rx={8} ry={5} fill="#7CC4FA" opacity={0.3} transform="rotate(-40 44 89)" />
          <ellipse cx={154} cy={92} rx={14} ry={10} fill="url(#sp-limb)" transform="rotate(40 154 92)" />
          <ellipse cx={152} cy={89} rx={8} ry={5} fill="#7CC4FA" opacity={0.3} transform="rotate(40 152 89)" />
        </>
      );
    case 'sleep':
      return (
        <>
          <ellipse cx={56} cy={122} rx={11} ry={8} fill="url(#sp-limb)" transform="rotate(10 56 122)" />
          <ellipse cx={144} cy={122} rx={11} ry={8} fill="url(#sp-limb)" transform="rotate(-10 144 122)" />
        </>
      );
  }
}

/* ─── 얼굴 서브컴포넌트 ─── */

function Face({ state }: { state: IconState }) {
  switch (state) {
    case 'idle':
      return (
        <>
          {/* 눈 (블링크) */}
          <g className="sp-blink" style={{ transformOrigin: '82px 106px' }}>
            <ellipse cx={82} cy={106} rx={11} ry={12} fill="url(#sp-eye-bg)" />
            <ellipse cx={84} cy={105} rx={6} ry={7} fill="url(#sp-pupil)" />
            <ellipse cx={87} cy={101} rx={3} ry={2.8} fill="white" opacity={0.95} />
            <ellipse cx={80} cy={109} rx={1.5} ry={1.2} fill="white" opacity={0.5} />
          </g>
          <g className="sp-blink" style={{ transformOrigin: '118px 106px' }}>
            <ellipse cx={118} cy={106} rx={11} ry={12} fill="url(#sp-eye-bg)" />
            <ellipse cx={120} cy={105} rx={6} ry={7} fill="url(#sp-pupil)" />
            <ellipse cx={123} cy={101} rx={3} ry={2.8} fill="white" opacity={0.95} />
            <ellipse cx={116} cy={109} rx={1.5} ry={1.2} fill="white" opacity={0.5} />
          </g>
          {/* 미소 */}
          <path d="M 88,126 Q 100,136 112,126" stroke="#1a1a3a" strokeWidth={2.2} strokeLinecap="round" fill="none" />
          {/* 볼 홍조 */}
          <ellipse cx={70} cy={120} rx={8} ry={4.5} fill="#F9A8D4" opacity={0.2} />
          <ellipse cx={130} cy={120} rx={8} ry={4.5} fill="#F9A8D4" opacity={0.2} />
        </>
      );

    case 'active':
      return (
        <>
          {/* 집중 눈 (작고 날카로운) */}
          <ellipse cx={82} cy={107} rx={8} ry={7} fill="url(#sp-eye-bg)" />
          <ellipse cx={83.5} cy={106} rx={4.5} ry={5} fill="url(#sp-pupil)" />
          <ellipse cx={85} cy={103} rx={2} ry={1.8} fill="white" opacity={0.9} />
          <ellipse cx={118} cy={107} rx={8} ry={7} fill="url(#sp-eye-bg)" />
          <ellipse cx={119.5} cy={106} rx={4.5} ry={5} fill="url(#sp-pupil)" />
          <ellipse cx={121} cy={103} rx={2} ry={1.8} fill="white" opacity={0.9} />
          {/* 일자 입 */}
          <line x1={90} y1={127} x2={110} y2={127} stroke="#1a1a3a" strokeWidth={2} strokeLinecap="round" />
        </>
      );

    case 'alert':
      return (
        <>
          {/* 놀란 큰 눈 */}
          <ellipse cx={82} cy={104} rx={13} ry={14} fill="url(#sp-eye-bg)" />
          <ellipse cx={82} cy={104} rx={13} ry={14} fill="none" stroke="#b8c4d0" strokeWidth={0.5} opacity={0.3} />
          <ellipse cx={84} cy={103} rx={7} ry={8} fill="url(#sp-pupil)" />
          <ellipse cx={87} cy={99} rx={3.5} ry={3.2} fill="white" opacity={0.95} />
          <ellipse cx={80} cy={108} rx={1.5} ry={1.2} fill="white" opacity={0.5} />
          <ellipse cx={118} cy={104} rx={13} ry={14} fill="url(#sp-eye-bg)" />
          <ellipse cx={118} cy={104} rx={13} ry={14} fill="none" stroke="#b8c4d0" strokeWidth={0.5} opacity={0.3} />
          <ellipse cx={120} cy={103} rx={7} ry={8} fill="url(#sp-pupil)" />
          <ellipse cx={123} cy={99} rx={3.5} ry={3.2} fill="white" opacity={0.95} />
          <ellipse cx={116} cy={108} rx={1.5} ry={1.2} fill="white" opacity={0.5} />
          {/* 놀란 O 입 */}
          <ellipse cx={100} cy={130} rx={6} ry={7} fill="#1a1a3a" />
          <ellipse cx={100} cy={128} rx={3} ry={3} fill="#2a2a5a" opacity={0.3} />
          {/* 알림 뱃지 */}
          <circle cx={170} cy={42} r={9} fill="#EF4444" className="sp-badge" />
          <text x={170} y={46} textAnchor="middle" fontSize={11} fontWeight={700} fill="white" fontFamily="sans-serif">!</text>
        </>
      );

    case 'sleep':
      return (
        <>
          {/* 감은 눈 */}
          <path d="M 72,107 Q 82,98 92,107" stroke="#1a1a3a" strokeWidth={2.5} strokeLinecap="round" fill="none" />
          <path d="M 108,107 Q 118,98 128,107" stroke="#1a1a3a" strokeWidth={2.5} strokeLinecap="round" fill="none" />
          {/* zzz */}
          <g className="sp-zzz1">
            <text x={148} y={68} fontSize={18} fill="#3B82F6" opacity={0.7} fontFamily="'Comic Sans MS',cursive" fontWeight="bold">z</text>
          </g>
          <g className="sp-zzz2">
            <text x={160} y={50} fontSize={13} fill="#3B82F6" opacity={0.5} fontFamily="'Comic Sans MS',cursive" fontWeight="bold">z</text>
          </g>
          {/* 볼 홍조 */}
          <ellipse cx={70} cy={118} rx={8} ry={4} fill="#F9A8D4" opacity={0.15} />
          <ellipse cx={130} cy={118} rx={8} ry={4} fill="#F9A8D4" opacity={0.15} />
        </>
      );
  }
}

/**
 * 쌤핀 ↔ 브릿지 ↔ AI 챗봇 다이어그램.
 * CSS 애니메이션만 사용(서버 컴포넌트). 다리 위로 데이터 입자가 흐른다.
 * globals.css 의 .bridge-particle / .node-pulse / .float-soft 에 의존.
 */

import type { ReactNode } from 'react';

/** 쌤핀 브랜드 핀 마크 (앱 아이콘 인라인 — public/icon_new.svg 기반, gradient id 보정) */
function SsampinMark({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      fill="none"
      className={className}
      role="img"
      aria-label="쌤핀"
    >
      <path
        d="M 21.87,248 C 20.97,248 20.31,247.63 18.91,246.31 C 18.28,245.08 18.55,243.78 18.86,242.68 L 26.09,220.3 C 26.32,219.59 26.69,218.93 27.19,218.35 L 74.58,165.21 L 79.98,164.19 L 81.21,169.31 L 32.29,224.41 L 28.44,236.97 L 41.53,230.46 L 90.61,176.25 L 93.81,176.01 L 94.42,181.56 L 45.92,236.51 C 45.42,237.08 44.82,237.56 44.15,237.91 L 23.88,247.55 C 23.22,247.88 22.54,248 21.87,248 Z"
        fill="url(#sp-pin-0)"
      />
      <path
        d="M 147.73,8 L 133.18,23.63 L 139.88,40.22 L 85.41,87.71 H 50.71 L 34.98,105.47 L 52.17,145.17 L 116.89,201.01 L 157.91,211.73 L 173.75,193.68 L 168.77,160.26 L 205.73,98.84 L 222.84,102.53 L 237.75,85.71 L 225.01,55.23 L 180.41,15.16 L 147.73,8 Z"
        fill="url(#sp-pin-1)"
      />
      <path
        d="M 147.73,8 L 158.98,35.21 L 208.61,78.62 L 237.75,85.71 L 225.01,55.23 L 180.41,15.16 L 147.73,8 Z"
        fill="url(#sp-pin-2)"
      />
      <path
        d="M 133.18,23.63 L 147.73,8 L 158.98,35.21 L 144.91,51.71 L 139.88,40.22 L 133.18,23.63 Z"
        fill="url(#sp-pin-3)"
      />
      <path
        d="M 149.91,62.48 L 182.92,90.89 L 193.61,94.72 L 208.61,78.62 L 158.98,35.21 L 144.91,51.71 L 149.91,62.48 Z"
        fill="url(#sp-pin-4)"
      />
      <path
        d="M 182.92,90.89 L 136.92,152.17 L 168.77,160.26 L 205.73,98.84 L 222.84,102.53 L 237.75,85.71 L 208.61,78.62 L 193.61,94.72 L 182.92,90.89 Z"
        fill="url(#sp-pin-5)"
      />
      <path
        d="M 136.92,152.17 L 132.02,182.51 L 173.75,193.68 L 168.77,160.26 L 136.92,152.17 Z"
        fill="url(#sp-pin-6)"
      />
      <path
        d="M 116.89,201.01 L 132.02,182.51 L 68.61,126.96 L 52.17,145.17 L 116.89,201.01 Z"
        fill="url(#sp-pin-7)"
      />
      <path
        d="M 50.71,87.31 L 68.61,126.96 L 97.91,118.22 L 85.41,87.71 L 50.71,87.31 Z"
        fill="url(#sp-pin-8)"
      />
      <path
        d="M 139.88,40.22 L 85.41,87.71 L 97.91,118.22 L 149.91,62.48 L 139.88,40.22 Z"
        fill="url(#sp-pin-9)"
      />
      <path
        d="M 97.91,118.22 L 136.92,152.17 L 182.92,90.89 L 149.91,62.48 L 97.91,118.22 Z"
        fill="url(#sp-pin-10)"
      />
      <path
        d="M 34.98,105.47 L 52.17,145.17 L 68.61,126.96 L 50.71,87.31 L 34.98,105.47 Z"
        fill="url(#sp-pin-11)"
      />
      <defs>
        <linearGradient
          id="sp-pin-0"
          x1="19.1212"
          y1="205.919"
          x2="94.4201"
          y2="205.919"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#386EAE" />
          <stop offset="1" stopColor="#3461A9" />
        </linearGradient>
        <linearGradient
          id="sp-pin-1"
          x1="70.156"
          y1="55.245"
          x2="168.312"
          y2="172.608"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59C9F8" />
          <stop offset="0.998" stopColor="#3667D6" />
        </linearGradient>
        <linearGradient
          id="sp-pin-2"
          x1="162.658"
          y1="11.2728"
          x2="209.122"
          y2="72.6495"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59C9F8" />
          <stop offset="0.998" stopColor="#3677E7" />
        </linearGradient>
        <linearGradient
          id="sp-pin-3"
          x1="142.431"
          y1="13.0903"
          x2="153.526"
          y2="52.0001"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59C9F8" />
          <stop offset="0.998" stopColor="#3677E7" />
        </linearGradient>
        <linearGradient
          id="sp-pin-4"
          x1="161.22"
          y1="37.9147"
          x2="189.94"
          y2="80.6507"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2B68E0" />
          <stop offset="1" stopColor="#59B1F2" />
        </linearGradient>
        <linearGradient
          id="sp-pin-5"
          x1="167.298"
          y1="91.3382"
          x2="203.38"
          y2="132.816"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2B59AD" />
          <stop offset="1" stopColor="#4687D1" />
        </linearGradient>
        <linearGradient
          id="sp-pin-6"
          x1="155.253"
          y1="157.439"
          x2="155.253"
          y2="193.682"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2B68E0" />
          <stop offset="1" stopColor="#59B1F2" />
        </linearGradient>
        <linearGradient
          id="sp-pin-7"
          x1="62.431"
          y1="134.404"
          x2="113.534"
          y2="177.944"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59B1F2" />
          <stop offset="0.998" stopColor="#3671E7" />
        </linearGradient>
        <linearGradient
          id="sp-pin-8"
          x1="59.0402"
          y1="89.6379"
          x2="85.9702"
          y2="120.962"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59C9F8" />
          <stop offset="0.998" stopColor="#59B1F2" />
        </linearGradient>
        <linearGradient
          id="sp-pin-9"
          x1="100.916"
          y1="50.5425"
          x2="135.791"
          y2="91.711"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#59C9F8" />
          <stop offset="0.998" stopColor="#3688E7" />
        </linearGradient>
        <linearGradient
          id="sp-pin-10"
          x1="117.811"
          y1="73.9022"
          x2="153.894"
          y2="121.915"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3677E7" />
          <stop offset="1" stopColor="#3688E7" />
        </linearGradient>
        <linearGradient
          id="sp-pin-11"
          x1="46.6829"
          y1="92.3071"
          x2="62.9896"
          y2="134.493"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#3677E7" />
          <stop offset="1" stopColor="#3671E7" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/** 보호(실명 가림·동의) 방패 아이콘 */
function ShieldIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

/** AI 챗봇 말풍선 아이콘 */
function ChatIcon({ className = 'h-7 w-7' }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function Track() {
  return (
    <div className="relative mt-7 h-0.5 flex-1 self-start" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-sp-border" />
      {/* 정방향(쌤핀 → AI) — 위 레인 */}
      {[0, 1.4].map((delay, i) => (
        <span
          key={`f${i}`}
          className="bridge-particle absolute h-2 w-2 rounded-full bg-sp-accent shadow-[0_0_8px_rgba(37,99,235,0.6)]"
          style={{ top: 'calc(50% - 5px)', animationDelay: `${delay}s` }}
        />
      ))}
      {/* 역방향(AI → 쌤핀) — 아래 레인 */}
      {[0.7, 2.1].map((delay, i) => (
        <span
          key={`r${i}`}
          className="bridge-particle-reverse absolute h-2 w-2 rounded-full bg-sp-accent/70 shadow-[0_0_8px_rgba(37,99,235,0.5)]"
          style={{ top: 'calc(50% + 5px)', animationDelay: `${delay}s` }}
        />
      ))}
    </div>
  );
}

function Node({
  icon,
  title,
  sub,
  pulse = false,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center gap-2 text-center sm:w-20">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-sp-border bg-sp-card shadow-sm ${
          pulse ? 'node-pulse' : ''
        }`}
      >
        {icon}
      </div>
      <div className="leading-tight">
        <p className="text-xs font-bold text-sp-text">{title}</p>
        <p className="text-[0.62rem] text-sp-muted">{sub}</p>
      </div>
    </div>
  );
}

export default function BridgeDiagram() {
  return (
    <div className="flex items-start justify-center gap-1.5 sm:gap-3">
      <Node icon={<SsampinMark />} title="쌤핀" sub="내 PC 데이터" pulse />

      <Track />

      {/* 가운데 브릿지 — 보호(실명 가림·동의) */}
      <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 sm:w-24">
        <div className="float-soft flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-sp-accent/40 bg-sp-accent/10 text-sp-accent shadow-md">
          <ShieldIcon className="h-8 w-8" />
        </div>
        <span className="whitespace-nowrap rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.58rem] font-semibold text-sp-accent sm:text-[0.62rem]">
          실명 가림 · 동의
        </span>
      </div>

      <Track />

      <Node
        icon={<ChatIcon className="h-7 w-7 text-sp-accent" />}
        title="AI 챗봇"
        sub="클로드·GPT·제미나이"
        pulse
      />
    </div>
  );
}

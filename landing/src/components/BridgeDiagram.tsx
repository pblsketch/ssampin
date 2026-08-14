/**
 * 쌤핀 ↔ 브릿지 ↔ AI 챗봇 다이어그램.
 * CSS 애니메이션만 사용(서버 컴포넌트). 다리 위로 데이터 입자가 흐른다.
 * globals.css 의 .bridge-particle / .node-pulse / .float-soft 에 의존.
 */

import Image from 'next/image';
import type { ReactNode } from 'react';

/** 쌤핀 브랜드 마크 — 마스코트 쌤핀이 (데스크톱 앱 아이콘·파비콘과 같은 그림). */
function SsampinMark({ className = 'h-9 w-9' }: { className?: string }) {
  return <Image src="/icon.png" alt="쌤핀" width={36} height={36} className={className} />;
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

/**
 * 쌤핀 ↔ 브릿지 ↔ AI 챗봇 다이어그램.
 * CSS 애니메이션만 사용(서버 컴포넌트). 다리 위로 데이터 입자가 흐른다.
 * globals.css 의 .bridge-particle / .node-pulse / .float-soft 에 의존.
 */

function Track() {
  return (
    <div className="relative mt-7 h-0.5 flex-1 self-start" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-sp-border" />
      {[0, 0.95, 1.9].map((delay, i) => (
        <span
          key={i}
          className="bridge-particle absolute top-1/2 h-2 w-2 rounded-full bg-sp-accent shadow-[0_0_8px_rgba(37,99,235,0.6)]"
          style={{ animationDelay: `${delay}s` }}
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
  icon: string;
  title: string;
  sub: string;
  pulse?: boolean;
}) {
  return (
    <div className="flex w-[68px] shrink-0 flex-col items-center gap-2 text-center sm:w-20">
      <div
        className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-sp-border bg-sp-card text-2xl shadow-sm ${
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
      <Node icon="🏫" title="쌤핀" sub="내 PC 데이터" pulse />

      <Track />

      {/* 가운데 브릿지 */}
      <div className="flex w-[76px] shrink-0 flex-col items-center gap-2 sm:w-24">
        <div className="float-soft flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-sp-accent/40 bg-sp-accent/10 text-2xl shadow-md">
          🌉
        </div>
        <span className="whitespace-nowrap rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.58rem] font-semibold text-sp-accent sm:text-[0.62rem]">
          실명 가림 · 동의
        </span>
      </div>

      <Track />

      <Node icon="💬" title="AI 챗봇" sub="클로드·GPT·제미나이" pulse />
    </div>
  );
}

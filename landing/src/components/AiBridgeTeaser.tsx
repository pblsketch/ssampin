import Link from 'next/link';
import FadeIn from './FadeIn';
import BridgeDiagram from './BridgeDiagram';

const points = [
  { icon: '🎭', text: '실명·연락처는 익명 토큰으로 가려요' },
  { icon: '🔒', text: '민감한 내용은 기본 잠금 — 켤 때만 열려요' },
  { icon: '🏫', text: '쌤핀 서버를 안 거치고 내 PC 안에서' },
];

export default function AiBridgeTeaser() {
  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-5xl px-6">
        <FadeIn>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold text-sp-accent">
              NEW · 베타
            </span>
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
              AI 브릿지
            </p>
          </div>
          <h2 className="mt-3 text-3xl font-bold text-sp-text md:text-4xl">
            쓰던 AI 챗봇에게 우리 반 자료를 맡기세요
          </h2>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-sp-muted">
            클로드·GPT·제미나이 같은 AI 챗봇과 쌤핀을 안전하게 잇습니다. 복잡한 설정도 API 키도
            없이, 평소처럼 채팅만 하면 돼요.
          </p>
        </FadeIn>

        <FadeIn delay={0.1}>
          <div className="mt-10 grid items-center gap-8 rounded-2xl border border-sp-border bg-sp-card p-7 shadow-sm md:grid-cols-2 md:p-10">
            <BridgeDiagram />

            <div>
              <ul className="space-y-3">
                {points.map((p) => (
                  <li key={p.text} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-base">
                      {p.icon}
                    </span>
                    <span className="text-sp-text/85">{p.text}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/ai-bridge"
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sp-accent px-6 py-3 text-sm font-bold text-white shadow-md shadow-sp-accent/20 transition-all hover:-translate-y-0.5 hover:bg-sp-accent-hover"
              >
                AI 브릿지 자세히 보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

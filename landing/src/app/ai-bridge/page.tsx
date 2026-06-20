import type { Metadata } from 'next';
import Link from 'next/link';
import BridgeDiagram from '@/components/BridgeDiagram';

export const metadata: Metadata = {
  title: '쌤핀 AI 브릿지 — 쓰던 AI 챗봇과 안전하게 연결',
  description:
    '평소 쓰는 AI 챗봇(클로드·GPT·제미나이)에게 쌤핀의 우리 학생들 자료를 안전하게 건네는 다리. API 키 없이, 내 컴퓨터 안에서. 실명은 가리고, 민감한 내용은 동의·게이트로 통제합니다.',
};

const TOOLS = [
  {
    icon: '🧑‍🎓',
    label: '학생 명단 보기',
    code: 'list_students',
    desc: '학생 명단을 "학번 + 익명 토큰"으로 봅니다. 실명·연락처·생일은 빠져요.',
  },
  {
    icon: '🪑',
    label: '자리 배치 보기',
    code: 'get_seating',
    desc: '누가 어디 앉는지 구조만 봅니다. 이름은 토큰으로 표시돼요.',
  },
  {
    icon: '✍️',
    label: '관찰 기록 남기기',
    code: 'add_observation',
    desc: 'AI와 정리한 관찰 내용을 기록으로 추가합니다. (쓰기를 켰을 때만)',
  },
  {
    icon: '📋',
    label: '관찰 기록 불러오기',
    code: 'get_observations',
    desc: '학생의 관찰 기록을 불러옵니다. (내용 보기를 켜거나 동의가 있을 때만)',
  },
  {
    icon: '✅',
    label: '생기부 초안 점검',
    code: 'check_record_draft',
    desc: '초안 문장이 관찰 기록에 근거하는지 확인합니다. 최종 판단은 선생님 몫이에요.',
  },
  {
    icon: '📖',
    label: '기재요령 확인',
    code: 'get_record_guidelines',
    desc: '학교생활기록부 기재요령(학교급·연도별)을 출처와 함께 알려줘요.',
  },
];

const SAFEGUARDS = [
  {
    icon: '🎭',
    title: '이름은 기본적으로 가려요',
    body: '이름·연락처·생일은 익명 토큰으로 바꿔서 내보냅니다. 다만 내용 맥락으로 누구인지 짐작될 수 있어, 민감한 기록은 신중히 다뤄 주세요.',
  },
  {
    icon: '🔒',
    title: '민감한 내용은 기본 잠금',
    body: '관찰 원문 보기와 기록 쓰기는 처음엔 꺼져 있어요. 선생님이 직접 켤 때만 열립니다. 안 켜면 명단·자리 같은 기본 정보만 다뤄요.',
  },
  {
    icon: '🤝',
    title: '허락은 선생님 손에',
    body: '학생·기간·목적별로 필요한 만큼만 허용할 수 있어요. 언제든 끄고 되돌릴 수 있습니다.',
  },
  {
    icon: '🏫',
    title: '데이터는 내 컴퓨터 안에',
    body: '쌤핀 서버를 거치지 않아요. 내 PC의 자료를 AI 챗봇에 바로 건넵니다. (연결한 AI 쪽 처리 정책은 그대로 적용돼요.)',
  },
];

const STEPS_A = [
  {
    n: '1',
    icon: '⚙️',
    title: '설정 → AI 연결 열기',
    desc: '쌤핀 설정에서 "AI 연결" 카드를 찾아요.',
  },
  {
    n: '2',
    icon: '🔗',
    title: '[연결] 한 번 누르기',
    desc: '클로드·GPT·제미나이 중 쓰는 걸 골라 클릭해요.',
  },
  {
    n: '3',
    icon: '💬',
    title: 'AI 앱 다시 켜기',
    desc: '챗봇을 재시작하면 쌤핀 도구가 나타나요. 끝!',
  },
];

const CLIENTS = [
  { key: 'claude', name: '클로드 (Claude)', cli: 'npx ssampin-ai-bridge register claude' },
  { key: 'codex', name: '코덱스 (GPT)', cli: 'npx ssampin-ai-bridge register codex' },
  {
    key: 'antigravity',
    name: '안티그래비티 (Gemini)',
    cli: 'npx ssampin-ai-bridge register antigravity',
  },
];

const FAQS = [
  {
    q: '제 데이터가 쌤핀 서버로 넘어가나요?',
    a: '아니요. 브릿지는 내 컴퓨터의 쌤핀 자료를 읽어 AI 챗봇에 바로 건넵니다. 쌤핀 서버는 끼어들지 않아요. 다만 연결한 AI(클로드·GPT·제미나이)에는 도구가 돌려준 정보가 전달되고, 그쪽 처리 정책이 적용됩니다.',
  },
  {
    q: 'AI나 코딩을 잘 몰라도 쓸 수 있나요?',
    a: '네. 평소 AI 챗봇을 쓰듯 채팅만 하면 됩니다. 연결은 쌤핀 설정에서 [연결] 버튼 한 번이면 끝이라, Node.js나 명령어를 몰라도 괜찮아요.',
  },
  {
    q: 'AI가 써 준 생기부 문장을 그대로 써도 되나요?',
    a: '안 됩니다. 기재요령상 생성형 AI 문장을 그대로 옮겨 적는 것은 금지이고, 기록의 주체는 선생님이에요. 브릿지의 점검 도구는 어휘 근거만 확인할 뿐, 사실·적합성은 선생님이 직접 판단·책임집니다.',
  },
];

function BackHeader() {
  return (
    <header className="border-b border-sp-border bg-sp-surface/80 backdrop-blur-sm">
      <div className="mx-auto max-w-4xl px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sp-muted transition-colors hover:text-sp-text"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span className="text-sm">홈으로</span>
        </Link>
      </div>
    </header>
  );
}

export default function AiBridgePage() {
  return (
    <div className="min-h-screen bg-sp-bg text-sp-text">
      <BackHeader />

      <main className="mx-auto max-w-3xl px-6 py-14">
        {/* Hero */}
        <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
          AI 브릿지 · 베타
        </p>
        <h1 className="text-3xl font-bold leading-snug text-sp-text md:text-[2.6rem]">
          쓰던 AI 챗봇과
          <br />
          <span className="text-sp-accent">우리 학생들 자료</span>를 안전하게 연결
        </h1>
        <p className="mt-5 text-base leading-relaxed text-sp-muted">
          평소 쓰는 클로드·GPT·제미나이에게 쌤핀의 자료를 맡겨 보세요.{' '}
          <strong className="text-sp-text">복잡한 설정도, API 키도 필요 없어요.</strong> 내 컴퓨터
          안에서, 실명은 가리고 민감한 내용은 허락한 만큼만 오갑니다.
        </p>

        {/* 다이어그램 */}
        <div className="mt-9 rounded-2xl border border-sp-border bg-sp-card p-6 shadow-sm md:p-8">
          <BridgeDiagram />
          <p className="mt-7 text-center text-sm leading-relaxed text-sp-muted">
            AI 챗봇에게 <strong className="text-sp-text">“학생 관찰 기록 좀 정리해줘”</strong> 라고
            부탁하면, 쌤핀이 자료를 안전하게 건네줘요.
            <br className="hidden sm:block" /> 선생님은 평소처럼 채팅만 하면 됩니다.
          </p>
        </div>

        {/* 개인정보 보호 — 안심 톤 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            안심하세요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">선생님 데이터, 이렇게 지켜드려요</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            기본값이 가장 안전하게 맞춰져 있어요. 더 열고 싶을 때만 선생님이 직접 켜는 구조라, 처음
            써 보셔도 걱정하지 않으셔도 됩니다.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {SAFEGUARDS.map((s) => (
              <div
                key={s.title}
                className="rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-lg">
                    {s.icon}
                  </span>
                  <h3 className="text-sm font-bold text-sp-text">{s.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-sp-muted">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 연결 방법 — 방법 A 강조 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            가장 쉬운 방법
          </p>
          <h2 className="text-2xl font-bold text-sp-text">쌤핀 앱에서 버튼 하나로 연결</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            내 컴퓨터에 Node.js가 없어도 됩니다 — 쌤핀이 알아서 처리해요. 아래 3단계가 전부입니다.
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {STEPS_A.map((s, i) => (
              <div
                key={s.n}
                className="relative rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-sp-accent text-xs font-bold text-white">
                    {s.n}
                  </span>
                  <span className="text-xl">{s.icon}</span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-sp-text">{s.title}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-sp-muted">{s.desc}</p>
                {i < STEPS_A.length - 1 && (
                  <span
                    className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-sp-accent/50 sm:block"
                    aria-hidden="true"
                  >
                    →
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* 방법 B — 접어두기 */}
          <details className="group mt-5 rounded-xl border border-sp-border bg-sp-card/50 px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-sp-muted transition-colors hover:text-sp-text [&::-webkit-details-marker]:hidden">
              <span className="inline-flex items-center gap-2">
                <span className="text-base">⌨️</span>
                터미널이 익숙한 분께 — 명령어로 등록 (개발자용)
              </span>
              <svg
                className="details-chevron shrink-0"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <div className="mt-4 border-t border-sp-border pt-4">
              <p className="text-xs leading-relaxed text-sp-muted">
                터미널에서 <code className="text-sp-text">npx</code> 한 줄로도 등록할 수 있어요
                (Node.js 필요). 쓰는 AI에 맞는 줄을 실행하세요.
              </p>
              <div className="mt-3 space-y-2">
                {CLIENTS.map((c) => (
                  <div key={c.key}>
                    <p className="mb-1 text-[0.7rem] font-medium text-sp-muted">{c.name}</p>
                    <pre className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface px-3.5 py-2.5 text-xs text-sp-text">
                      <code>{c.cli}</code>
                    </pre>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.7rem] leading-relaxed text-sp-muted/80">
                데이터 폴더를 못 찾으면{' '}
                <code className="text-sp-text">--data-dir &quot;%APPDATA%/쌤핀/data&quot;</code> 를
                덧붙이세요. 관찰 내용 보기는 <code className="text-sp-text">--allow-content</code>,
                쓰기는 <code className="text-sp-text">--allow-write</code> 로 켭니다(기본은 둘 다
                꺼짐).
              </p>
            </div>
          </details>
        </section>

        {/* 6가지 도구 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            무엇을 할 수 있나요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">AI가 쓸 수 있는 6가지 도구</h2>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <div
                key={t.code}
                className="rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">{t.icon}</span>
                  <h3 className="text-sm font-bold text-sp-text">{t.label}</h3>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-sp-muted">{t.desc}</p>
                <code className="mt-3 inline-block text-[0.68rem] text-sp-muted/60">{t.code}</code>
              </div>
            ))}
          </div>
        </section>

        {/* 세 AI 동등 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            한쪽에 치우치지 않아요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">세 가지 AI를 똑같이 지원</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            연결 버튼만 다를 뿐, 똑같은 6가지 기능과 똑같은 개인정보 보호가 적용됩니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              { name: '클로드', maker: 'Anthropic' },
              { name: '코덱스 (GPT)', maker: 'OpenAI' },
              { name: '안티그래비티 (Gemini)', maker: 'Google' },
            ].map((c) => (
              <div
                key={c.name}
                className="flex-1 rounded-xl border border-sp-border bg-sp-card px-5 py-4 text-center shadow-sm"
              >
                <p className="text-sm font-bold text-sp-text">{c.name}</p>
                <p className="mt-0.5 text-xs text-sp-muted/70">{c.maker}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            궁금해요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">자주 묻는 질문</h2>
          <div className="mt-6 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-sp-border bg-sp-card px-5 py-4 shadow-sm"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-sp-text [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg
                    className="details-chevron shrink-0 text-sp-muted"
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <p className="mt-3 border-t border-sp-border pt-3 text-sm leading-relaxed text-sp-muted">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* 개인정보 링크 */}
        <div className="mt-14 border-t border-sp-border pt-6 text-center text-sm text-sp-muted">
          데이터 처리에 대한 자세한 내용은{' '}
          <Link
            href="/privacy"
            className="font-medium text-sp-accent transition-colors hover:underline"
          >
            개인정보처리방침
          </Link>
          을 참고하세요.
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '쌤핀 AI 브릿지 — 외부 AI와 안전하게 연결',
  description:
    '쌤핀의 로컬 데이터를 Claude·Codex(GPT)·Antigravity(Gemini) 같은 외부 AI 도구와 API 키 없이 연결하는 AI 브릿지. 실명은 토큰으로 가리고, 내용 노출은 동의·게이트로 통제합니다.',
};

const TOOLS = [
  {
    name: 'list_students',
    desc: '학생 명단을 "학번 + 불투명 토큰"으로 반환합니다. 실명·연락처·생년월일은 포함하지 않습니다.',
  },
  {
    name: 'get_seating',
    desc: '자리 배치를 토큰 격자로 보여줍니다. 누가 어디 앉는지 구조만, 이름은 토큰으로.',
  },
  {
    name: 'add_observation',
    desc: '관찰 기록을 추가합니다(쓰기 게이트가 켜져 있을 때만). 학생은 토큰으로 지목합니다.',
  },
  {
    name: 'get_observations',
    desc: '학생의 관찰 기록을 가져옵니다(내용 게이트/동의가 있을 때만). 본문 속 다른 학생 실명은 토큰으로 치환됩니다.',
  },
  {
    name: 'check_record_draft',
    desc: '생기부 초안 문장이 관찰 기록에 어휘적으로 근거하는지 검사합니다. "승인"이 아니라 근거 점검이며, 최종 판단은 교사 몫입니다.',
  },
  {
    name: 'get_record_guidelines',
    desc: '학교생활기록부 기재요령(학교급·연도별)을 요약·출처와 함께 제공합니다.',
  },
];

const CLIENTS = [
  {
    key: 'claude',
    name: 'Claude Desktop',
    maker: 'Anthropic',
    how: '설정 파일(claude_desktop_config.json)의 mcpServers에 쌤핀을 안전 병합합니다. 기존에 등록된 다른 서버는 그대로 보존하고, 변경 전 자동 백업합니다.',
    cli: 'npx ssampin-ai-bridge register claude',
  },
  {
    key: 'codex',
    name: 'Codex (GPT)',
    maker: 'OpenAI',
    how: 'codex CLI의 `codex mcp add` 명령으로 등록합니다. codex CLI가 없으면, 설치 후 실행할 명령을 안내합니다.',
    cli: 'npx ssampin-ai-bridge register codex',
  },
  {
    key: 'antigravity',
    name: 'Antigravity (Gemini)',
    maker: 'Google',
    how: '설정 파일(~/.gemini/antigravity/mcp_config.json)에 쌤핀을 안전 병합합니다. 기존 서버 보존 + 자동 백업.',
    cli: 'npx ssampin-ai-bridge register antigravity',
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
        <h1 className="text-3xl font-bold text-sp-text md:text-4xl">
          쌤핀 데이터를 외부 AI와 안전하게 연결
        </h1>
        <p className="mt-5 text-base leading-relaxed text-sp-muted">
          쌤핀에 저장된 학생·자리·관찰 기록을 Claude, Codex(GPT), Antigravity(Gemini) 같은 외부 AI
          도구에서 다룰 수 있게 잇는 다리입니다.{' '}
          <strong className="text-sp-text">API 키가 필요 없고</strong>, 데이터는 쌤핀 서버를 거치지
          않습니다. AI에 보내기 전에{' '}
          <strong className="text-sp-text">실명·연락처는 토큰으로 가리고</strong>, 민감한 내용은{' '}
          <strong className="text-sp-text">동의와 게이트</strong>로 통제합니다.
        </p>

        {/* 정직 고지 — 가장 먼저, 눈에 띄게 */}
        <section className="mt-10 rounded-xl border border-sp-accent/40 bg-sp-card p-6">
          <h2 className="text-lg font-bold text-sp-text">먼저, 솔직하게 알려드립니다</h2>
          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-sp-muted">
            <li>
              <strong className="text-sp-text">토큰화는 "실명만" 가립니다.</strong>{' '}
              이름·전화·생년월일은 불투명 토큰으로 바뀌지만, 토큰화만으로 완전한 익명이 되는 것은
              아닙니다. 관찰 내용에 담긴 맥락으로 누구인지 다시 짐작될 수 있습니다(재식별 가능).
            </li>
            <li>
              <strong className="text-sp-text">
                get_observations는 관찰 "원문"이 외부 AI로 나갑니다.
              </strong>{' '}
              이 도구를 쓰면 동급생 실명은 토큰으로 치환되지만, 관찰 내용 자체(가정 형편·건강·생활
              맥락 등 민감 정보 포함 가능)는 그대로 외부 AI에 전달됩니다. 그래서 이 도구는{' '}
              <strong className="text-sp-text">내용 게이트(또는 학생·기간·목적별 동의)</strong>가
              켜졌을 때만 동작합니다.
            </li>
            <li>
              <strong className="text-sp-text">쓰기·내용 노출은 기본적으로 꺼져 있습니다.</strong>{' '}
              쓰기(관찰 추가)와 내용 노출은 명시적으로 켜야만 작동합니다. 켜지 않으면 명단·자리 같은
              토큰화된 정보만 다룰 수 있습니다.
            </li>
            <li>
              <strong className="text-sp-text">생기부는 법정 기록입니다.</strong>{' '}
              check_record_draft는 "승인"이 아니라 어휘 근거 점검일 뿐이며, 모든 문장은 교사가 직접
              사실 확인하고 책임져야 합니다. 생성형 AI가 만든 문장을 그대로 옮겨 적는 것은
              기재요령상 금지입니다.
            </li>
          </ul>
        </section>

        {/* 6 tools */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-sp-text">무엇을 할 수 있나요 — 6가지 도구</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {TOOLS.map((t) => (
              <div key={t.name} className="rounded-lg border border-sp-border bg-sp-card p-4">
                <code className="text-sm font-semibold text-sp-accent">{t.name}</code>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 연결 방법 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-sp-text">연결하는 두 가지 방법</h2>

          {/* A안 */}
          <div className="mt-5 rounded-xl border border-sp-border bg-sp-card p-6">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
              방법 A · 추천
            </p>
            <h3 className="mt-2 text-lg font-bold text-sp-text">쌤핀 앱에서 원클릭</h3>
            <p className="mt-3 text-sm leading-relaxed text-sp-muted">
              쌤핀 <strong className="text-sp-text">설정 &gt; AI 연결</strong> 카드에서
              Claude·Codex·Antigravity 중 원하는 도구의{' '}
              <strong className="text-sp-text">[연결]</strong> 버튼을 누르면 끝납니다. 내 컴퓨터에
              Node.js가 설치되어 있지 않아도 됩니다 — 쌤핀이 동봉한 실행 환경을 그대로 씁니다.
              내용/쓰기 노출은 같은 카드의 토글로 켜고 끕니다.
            </p>
            <ol className="mt-4 ml-4 list-decimal space-y-1 text-sm text-sp-muted">
              <li>쌤핀 설정 → AI 연결 카드 열기</li>
              <li>연결할 AI(Claude / Codex / Antigravity) 선택 후 [연결]</li>
              <li>해당 AI 앱(또는 codex)을 재시작하면 6가지 도구가 나타남</li>
            </ol>
          </div>

          {/* B안 */}
          <div className="mt-5 rounded-xl border border-sp-border bg-sp-card p-6">
            <p className="text-[0.7rem] font-semibold uppercase tracking-widest text-sp-muted">
              방법 B · 개발자/CLI
            </p>
            <h3 className="mt-2 text-lg font-bold text-sp-text">명령어로 등록 (npx)</h3>
            <p className="mt-3 text-sm leading-relaxed text-sp-muted">
              터미널에 익숙하다면 npx 한 줄로 등록할 수 있습니다(Node.js 필요). 데이터 폴더와
              게이트를 옵션으로 지정합니다.
            </p>
            <div className="mt-4 space-y-2">
              {CLIENTS.map((c) => (
                <pre
                  key={c.key}
                  className="overflow-x-auto rounded-lg border border-sp-border bg-sp-surface px-4 py-3 text-xs text-sp-text"
                >
                  <code>{c.cli} --data-dir &quot;%APPDATA%/쌤핀/data&quot;</code>
                </pre>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-sp-muted/80">
              내용 노출을 켜려면 <code className="text-sp-text">--allow-content</code>, 쓰기를
              켜려면 <code className="text-sp-text">--allow-write</code> 를 덧붙입니다(기본은 둘 다
              꺼짐).
            </p>
          </div>
        </section>

        {/* 3 clients detail */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-sp-text">세 가지 AI를 동등하게 지원</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            특정 AI에 치우치지 않습니다. 등록 방식만 도구마다 다를 뿐, 똑같은 6가지 기능과 똑같은
            개인정보 보호가 적용됩니다.
          </p>
          <div className="mt-5 space-y-3">
            {CLIENTS.map((c) => (
              <div key={c.key} className="rounded-lg border border-sp-border bg-sp-card p-5">
                <div className="flex items-baseline gap-2">
                  <h3 className="text-base font-bold text-sp-text">{c.name}</h3>
                  <span className="text-xs text-sp-muted/70">{c.maker}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">{c.how}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ / 한계 */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-sp-text">자주 묻는 질문</h2>
          <div className="mt-5 space-y-5">
            <div>
              <h3 className="text-sm font-semibold text-sp-text">
                데이터가 쌤핀 서버로 전송되나요?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-sp-muted">
                아니요. 브릿지는 내 컴퓨터의 쌤핀 데이터를 읽어 외부 AI 도구에 직접 전달합니다. 쌤핀
                서버는 이 과정에 관여하지 않습니다. 다만 연결한 외부 AI(Claude·GPT·Gemini)에는
                도구가 반환한 정보가 전달되며, 그쪽의 처리 정책이 적용됩니다.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-sp-text">토큰만 보내면 안전한가요?</h3>
              <p className="mt-1 text-sm leading-relaxed text-sp-muted">
                명단·자리처럼 토큰만 다루는 기능은 실명이 나가지 않습니다. 하지만 관찰 내용을 보내는
                기능은 원문이 나가므로, 맥락으로 재식별될 수 있습니다. 꼭 필요한 경우에만,
                동의·게이트를 켜고 쓰세요.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-sp-text">
                AI가 만든 생기부 문장을 그대로 써도 되나요?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-sp-muted">
                안 됩니다. 기재요령상 생성형 AI 문장의 단순 전사(轉寫)는 금지이며, 기록 주체는
                교사입니다. 브릿지의 점검 도구는 어휘 근거만 확인할 뿐, 사실·적합성은 교사가 직접
                판단·책임져야 합니다.
              </p>
            </div>
          </div>
        </section>

        {/* 개인정보 링크 */}
        <div className="mt-12 border-t border-sp-border pt-6 text-center text-sm text-sp-muted">
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

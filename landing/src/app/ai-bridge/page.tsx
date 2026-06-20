import type { Metadata } from 'next';
import Link from 'next/link';
import BridgeDiagram from '@/components/BridgeDiagram';

export const metadata: Metadata = {
  title: '쌤핀 AI 브릿지 — 쓰던 AI 챗봇과 안전하게 연결',
  description:
    '평소 쓰는 AI 챗봇(클로드·GPT·제미나이)에게 쌤핀의 우리 학생들 자료를 안전하게 건네는 다리. API 키 없이, 내 컴퓨터 안에서. 실명은 가리고, 민감한 내용은 동의·게이트로 통제합니다.',
};

type ToolGroup = {
  icon: string;
  title: string;
  summary: string;
  tools: { label: string; code: string; gate?: '쓰기' | '동의' }[];
};

const TOOL_GROUPS: ToolGroup[] = [
  {
    icon: '🧑‍🎓',
    title: '학생 · 자리',
    summary: '명단·수업반·좌석을 익명 토큰으로 봐요. 실명·연락처·생일은 빠집니다.',
    tools: [
      { label: '수업반 목록', code: 'list_classes' },
      { label: '학생 명단', code: 'list_students' },
      { label: '자리 배치', code: 'get_seating' },
    ],
  },
  {
    icon: '🗓️',
    title: '수업 · 학급 운영',
    summary:
      '급식·시간표·일정·디데이·할 일을 한눈에. 날짜·상태 같은 기본 정보는 그대로, 제목·내용은 동의를 켤 때만 보여요.',
    tools: [
      { label: '급식 식단', code: 'get_meals' },
      { label: '시간표', code: 'get_schedule' },
      { label: '학사·학급 일정', code: 'get_events' },
      { label: '디데이', code: 'get_ddays' },
      { label: '할 일', code: 'get_todos' },
    ],
  },
  {
    icon: '📝',
    title: '노트 · 메모 · 북마크',
    summary: '노트 구조·포스트잇·북마크를 정리해요. 본문·내용은 동의를 켤 때만 열립니다.',
    tools: [
      { label: '노트 구조', code: 'get_notes' },
      { label: '포스트잇 메모', code: 'get_memos' },
      { label: '북마크', code: 'get_bookmarks' },
    ],
  },
  {
    icon: '🔍',
    title: '관찰 기록 · 생기부',
    summary:
      '관찰을 모으고, 생기부 초안이 관찰 기록에 근거하는지 점검해요. 최종 판단은 선생님 몫이에요.',
    tools: [
      { label: '관찰 기록 남기기', code: 'add_observation', gate: '쓰기' },
      { label: '관찰 기록 불러오기', code: 'get_observations', gate: '동의' },
      { label: '생기부 초안 점검', code: 'check_record_draft' },
      { label: '기재요령 확인', code: 'get_record_guidelines' },
    ],
  },
  {
    icon: '🏅',
    title: '수행평가 · 성적',
    summary: '점수·석차는 빼고 도달 수준·성취도 같은 질적 자료만. 세특 서술 근거로 써요.',
    tools: [
      { label: '평가표 구조', code: 'get_rubric' },
      { label: '수행평가 피드백', code: 'get_performance_feedback', gate: '동의' },
      { label: '성적 질적 요약', code: 'get_grade_summary', gate: '동의' },
      { label: '수행평가 채점 입력', code: 'set_rubric_grading', gate: '쓰기' },
    ],
  },
];

type Scenario = {
  icon: string;
  title: string;
  who: string;
  gate: '읽기' | '동의' | '쓰기';
  say: string;
  tools: string[];
  note: string;
};

const SCENARIOS: Scenario[] = [
  {
    icon: '📝',
    title: '생기부 초안, 근거부터 잡기',
    who: '담임',
    gate: '동의',
    say: '3번 학생 이번 학기 관찰 기록 모아서 행동특성 초안 잡아주고, 기재요령에 안 맞는 표현 있으면 짚어줘.',
    tools: ['get_observations', 'check_record_draft', 'get_record_guidelines'],
    note: 'AI가 쓴 문장이 실제 관찰 기록에 근거하는지까지 점검해요. 최종 확인은 선생님 몫.',
  },
  {
    icon: '🏅',
    title: '세특에 쓸 역량·태도 정리',
    who: '교과',
    gate: '동의',
    say: '내 수업반 김OO 수행평가랑 성적 보고, 세특에 들어갈 역량·태도 정리해줘. 점수는 빼고.',
    tools: ['list_students', 'get_performance_feedback', 'get_grade_summary'],
    note: '점수·석차는 빼고 도달 수준·성취도 같은 질적 근거만 모아요.',
  },
  {
    icon: '✍️',
    title: '관찰 기록을 말 한마디로',
    who: '담임·교과',
    gate: '쓰기',
    say: '오늘 5번 학생이 모둠 토론에서 친구 의견을 끝까지 경청했어. 관찰 기록 남겨줘.',
    tools: ['list_students', 'add_observation'],
    note: '수업 끝나고 떠오른 순간을 바로 기록으로. (쓰기를 켰을 때만)',
  },
  {
    icon: '🗓️',
    title: '이번 주 알림장 초안 만들기',
    who: '담임',
    gate: '읽기',
    say: '이번 주 우리 반 일정·디데이·마감 할 일 정리해서 학부모 알림장 초안 만들어줘.',
    tools: ['get_events', 'get_ddays', 'get_todos'],
    note: '설정을 안 켜도 날짜·상태는 바로 읽혀요.',
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
    body: '외부 서버를 거치지 않아요. 내 PC의 자료를 AI 챗봇에 바로 건넵니다. (연결한 AI 쪽 처리 정책은 그대로 적용돼요.)',
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
    q: '제 데이터가 외부 서버로 넘어가나요?',
    a: '아니요. 브릿지는 내 컴퓨터의 쌤핀 자료를 읽어 AI 챗봇에 바로 건넵니다. 외부 서버는 끼어들지 않아요. 다만 연결한 AI(클로드·GPT·제미나이)에는 도구가 돌려준 정보가 전달되고, 그쪽 처리 정책이 적용됩니다.',
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

        {/* 활용 시나리오 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            이렇게 써요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">AI 챗봇에게 이렇게 말해 보세요</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            명령어를 외울 필요 없어요. 평소 말투로 부탁하면, 쌤핀이 알아서 필요한 자료를 챙겨
            줍니다.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {SCENARIOS.map((s) => (
              <div
                key={s.title}
                className="flex flex-col rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-lg">
                    {s.icon}
                  </span>
                  <h3 className="text-sm font-bold text-sp-text">{s.title}</h3>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-sp-border bg-sp-surface/60 px-2 py-0.5 text-[0.62rem] font-medium text-sp-muted">
                    {s.who}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${
                      s.gate === '쓰기'
                        ? 'bg-sp-highlight/15 text-sp-highlight'
                        : s.gate === '동의'
                          ? 'bg-sp-accent/15 text-sp-accent'
                          : 'border border-sp-border bg-sp-surface/60 text-sp-muted'
                    }`}
                  >
                    {s.gate}
                  </span>
                </div>
                <div className="mt-3.5 rounded-2xl rounded-tl-sm border border-sp-accent/20 bg-sp-accent/5 px-4 py-3">
                  <p className="text-sm leading-relaxed text-sp-text">
                    <span className="mr-1 select-none">💬</span>“{s.say}”
                  </p>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-sp-muted">{s.note}</p>
                <div className="mt-auto flex flex-wrap items-center gap-y-1 pt-3.5 text-[0.68rem] text-sp-muted/70">
                  {s.tools.map((t, i) => (
                    <span key={t} className="inline-flex items-center">
                      <code className="text-sp-muted/80">{t}</code>
                      {i < s.tools.length - 1 && (
                        <span className="mx-1 text-sp-accent/40" aria-hidden="true">
                          →
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 도구 — 쓰임새별 묶음 */}
        <section className="mt-14">
          <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            무엇을 할 수 있나요
          </p>
          <h2 className="text-2xl font-bold text-sp-text">AI가 쓸 수 있는 도구 19가지</h2>
          <p className="mt-3 text-sm leading-relaxed text-sp-muted">
            쓰임새별로 묶어 봤어요.{' '}
            <span className="rounded bg-sp-highlight/15 px-1 text-[0.72rem] font-semibold text-sp-highlight">
              쓰기
            </span>{' '}
            표시가 붙은 도구만 기록을 바꾸고(기본 꺼짐),{' '}
            <span className="rounded bg-sp-accent/15 px-1 text-[0.72rem] font-semibold text-sp-accent">
              동의
            </span>{' '}
            표시는 내용 노출을 허락했을 때만 열립니다.
          </p>
          <div className="mt-6 grid items-start gap-4 md:grid-cols-2">
            {TOOL_GROUPS.map((g) => (
              <div
                key={g.title}
                className="rounded-xl border border-sp-border bg-sp-card p-5 shadow-sm"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sp-accent/10 text-lg">
                    {g.icon}
                  </span>
                  <h3 className="text-sm font-bold text-sp-text">{g.title}</h3>
                  <span className="ml-auto text-[0.65rem] font-medium text-sp-muted/60">
                    {g.tools.length}개
                  </span>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-sp-muted">{g.summary}</p>
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {g.tools.map((t) => (
                    <span
                      key={t.code}
                      title={t.code}
                      className="inline-flex items-center gap-1 rounded-md border border-sp-border bg-sp-surface/60 px-2 py-1 text-[0.72rem] text-sp-text"
                    >
                      {t.label}
                      {t.gate && (
                        <span
                          className={`rounded px-1 text-[0.6rem] font-semibold ${
                            t.gate === '쓰기'
                              ? 'bg-sp-highlight/15 text-sp-highlight'
                              : 'bg-sp-accent/15 text-sp-accent'
                          }`}
                        >
                          {t.gate}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
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
            연결 버튼만 다를 뿐, 똑같은 도구와 똑같은 개인정보 보호가 적용됩니다.
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

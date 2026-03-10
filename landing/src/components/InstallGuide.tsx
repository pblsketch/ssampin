'use client';

import { useState } from 'react';
import FadeIn from './FadeIn';

const steps = [
  {
    number: '01',
    title: '다운로드',
    description: '아래 버튼을 클릭해 설치 파일을 받으세요.',
  },
  {
    number: '02',
    title: '실행',
    description: '다운받은 설치 파일을 더블클릭해 실행하세요.',
  },
  {
    number: '03',
    title: '시작',
    description: '바탕화면의 쌤핀 아이콘을 클릭하면 바로 시작됩니다.',
  },
];

const troubleshootCases = [
  {
    id: 'smartscreen',
    icon: '🛡️',
    label: '보안 경고가 떠요',
    title: '"Windows의 PC 보호" 화면이 뜰 때',
    description: 'Windows SmartScreen이 알 수 없는 앱을 차단한 경우예요.',
    steps: [
      { text: <><strong className="text-amber-200/80">&quot;추가 정보&quot;</strong>를 클릭합니다</> },
      { text: <><strong className="text-amber-200/80">&quot;실행&quot;</strong> 버튼을 클릭합니다</> },
    ],
  },
  {
    id: 'smart-app-control',
    icon: '⛔',
    label: '스마트 앱 컨트롤',
    title: '"스마트 앱 컨트롤이 차단했습니다" (Windows 11)',
    description: 'Windows 11의 스마트 앱 컨트롤이 실행을 막은 경우예요.',
    steps: [
      { text: <>설치 파일을 우클릭 → <strong className="text-amber-200/80">&quot;속성&quot;</strong> 선택</> },
      { text: <>하단 <strong className="text-amber-200/80">&quot;차단 해제&quot;</strong> 체크박스 체크 → 확인</> },
      { text: <>설치 파일을 다시 더블클릭</> },
    ],
  },
  {
    id: 'antivirus',
    icon: '🦠',
    label: '백신이 차단해요',
    title: '백신(V3, 알약 등)이 차단하거나 삭제할 때',
    description: '백신 프로그램이 설치 파일을 위험하다고 판단한 경우예요. 더블클릭해도 아무 반응이 없다면 이 경우일 가능성이 높아요!',
    steps: [
      { text: <>백신 프로그램을 열어 <strong className="text-amber-200/80">&quot;실시간 감시&quot;</strong> 또는 &quot;실시간 보호&quot;를 일시 중지합니다</> },
      { text: <>설치 파일을 다시 더블클릭하여 설치합니다</> },
      { text: <>설치가 끝나면 <strong className="text-amber-200/80">실시간 감시를 다시 켜주세요</strong></> },
    ],
    extraTip: 'V3: 트레이 아이콘 우클릭 → 실시간 검사 일시 중지\n알약: 트레이 아이콘 우클릭 → 실시간 감시 해제',
  },
  {
    id: 'no-response',
    icon: '😶',
    label: '아무 반응이 없어요',
    title: '더블클릭해도 아무 반응이 없을 때',
    description: '설치 파일을 실행했는데 아무 창도 안 뜨는 경우예요.',
    steps: [
      { text: <>먼저 위의 <strong className="text-amber-200/80">&quot;백신 차단&quot;</strong> 해결법을 시도해보세요 (가장 흔한 원인!)</> },
      { text: <>그래도 안 되면: 설치 파일 우클릭 → <strong className="text-amber-200/80">&quot;관리자 권한으로 실행&quot;</strong></> },
      { text: <>여전히 안 되면: 설치 파일 우클릭 → &quot;속성&quot; → <strong className="text-amber-200/80">&quot;차단 해제&quot;</strong> 체크 → 확인 후 다시 실행</> },
    ],
  },
];

export default function InstallGuide() {
  const [openCase, setOpenCase] = useState<string | null>(null);

  const toggleCase = (id: string) => {
    setOpenCase((prev) => (prev === id ? null : id));
  };

  return (
    <section className="bg-sp-bg py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            설치는 3단계면 끝
          </h2>
          <p className="mt-3 text-base text-sp-muted">다운로드부터 실행까지 1분 이내</p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {steps.map((step, i) => (
            <FadeIn key={step.number} delay={i * 0.1}>
              <div className="rounded-xl bg-sp-card p-7">
                <div className="mb-4 text-2xl font-extrabold tracking-tight text-sp-accent/50">
                  {step.number}
                </div>
                <h3 className="text-base font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-sp-muted">{step.description}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        {/* 트러블슈팅 섹션 */}
        <FadeIn className="mt-10" delay={0.3}>
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-6">
            <p className="text-lg font-semibold text-amber-200">
              설치가 안 되시나요?
            </p>
            <p className="mt-1.5 text-sm text-amber-200/70">
              증상을 선택하면 해결 방법을 알려드려요!
            </p>

            {/* 증상 선택 버튼 그리드 */}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {troubleshootCases.map((tc) => (
                <button
                  key={tc.id}
                  type="button"
                  onClick={() => toggleCase(tc.id)}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-left text-sm font-medium transition-all ${
                    openCase === tc.id
                      ? 'border-amber-400/40 bg-amber-500/15 text-amber-200'
                      : 'border-amber-500/15 bg-amber-500/5 text-amber-200/70 hover:border-amber-500/25 hover:bg-amber-500/10 hover:text-amber-200/90'
                  }`}
                >
                  <span className="text-base">{tc.icon}</span>
                  <span>{tc.label}</span>
                </button>
              ))}
            </div>

            {/* 선택된 케이스 해결법 */}
            {troubleshootCases.map((tc) => (
              <div
                key={tc.id}
                className={`overflow-hidden transition-all duration-300 ${
                  openCase === tc.id ? 'mt-4 max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
                }`}
              >
                <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 p-4">
                  <p className="text-sm font-semibold text-amber-300">
                    {tc.icon} {tc.title}
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-amber-200/60">
                    {tc.description}
                  </p>

                  <ol className="mt-3 space-y-2">
                    {tc.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-amber-200/70">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.65rem] font-bold text-amber-300">
                          {i + 1}
                        </span>
                        <span className="pt-0.5">{step.text}</span>
                      </li>
                    ))}
                  </ol>

                  {tc.extraTip && (
                    <div className="mt-3 rounded-md bg-amber-500/5 px-3 py-2">
                      {tc.extraTip.split('\n').map((line, i) => (
                        <p key={i} className="text-[0.7rem] text-amber-200/50">
                          💡 {line}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            <p className="mt-4 text-xs text-amber-200/40">
              코드 서명 인증서를 준비 중이며, 곧 경고 없이 설치하실 수 있게 됩니다.
            </p>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

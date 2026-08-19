'use client';

import { useEffect, useState } from 'react';
import FadeIn from './FadeIn';
import WindowsProtectionAnimation from './WindowsProtectionAnimation';
import DownloadButton from './DownloadButton';

const steps = [
  {
    number: '01',
    title: '다운로드',
    description: '위 다운로드 버튼을 클릭해 설치 파일을 받으세요.',
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

const macSteps = [
  {
    number: '01',
    title: '다운로드',
    description:
      '.dmg 파일을 받으세요. 🍎 메뉴 → "이 Mac에 관하여"의 칩 항목을 보고 Apple Silicon(M1~M4)과 Intel 중 맞는 버전을 고르세요.',
  },
  {
    number: '02',
    title: '설치',
    description: '.dmg를 열고 쌤핀 아이콘을 응용 프로그램 폴더로 드래그하세요.',
  },
  {
    number: '03',
    title: '시작',
    description: 'Launchpad 또는 응용 프로그램에서 쌤핀을 실행하세요.',
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
      {
        text: (
          <>
            <strong className="text-amber-800">&quot;추가 정보&quot;</strong>를 클릭합니다
          </>
        ),
      },
      {
        text: (
          <>
            <strong className="text-amber-800">&quot;실행&quot;</strong> 버튼을 클릭합니다
          </>
        ),
      },
    ],
  },
  {
    id: 'smart-app-control',
    icon: '⛔',
    label: '스마트 앱 컨트롤',
    title: '"스마트 앱 컨트롤이 차단했습니다" (Windows 11)',
    description:
      'Windows 11의 스마트 앱 컨트롤이 실행을 막은 경우예요. 코드 서명이 없는 앱은 "무시" 버튼 없이 완전히 차단돼요.',
    steps: [
      {
        text: (
          <>
            설치 파일 우클릭 → <strong className="text-amber-800">&quot;속성&quot;</strong> → 하단{' '}
            <strong className="text-amber-800">&quot;차단 해제&quot;</strong> 체크 → 확인 후 다시
            실행
          </>
        ),
      },
      {
        text: (
          <>
            위 방법이 안 되면: <strong className="text-amber-800">설정</strong> →{' '}
            <strong className="text-amber-800">개인정보 및 보안</strong> →{' '}
            <strong className="text-amber-800">Windows 보안</strong> →{' '}
            <strong className="text-amber-800">앱 및 브라우저 컨트롤</strong>
          </>
        ),
      },
      {
        text: (
          <>
            <strong className="text-amber-800">&quot;스마트 앱 컨트롤 설정&quot;</strong>을 클릭하고{' '}
            <strong className="text-amber-800">&quot;끔&quot;</strong>을 선택합니다
          </>
        ),
      },
      { text: <>설치 파일을 다시 더블클릭합니다</> },
    ],
    extraTip:
      '⚠️ 스마트 앱 컨트롤은 한번 끄면 PC를 초기화하기 전까지 다시 켤 수 없어요.\n쌤핀 설치 후에도 다른 앱은 Windows 보안(SmartScreen)이 계속 보호합니다.',
  },
  {
    id: 'antivirus',
    icon: '🦠',
    label: '백신이 차단해요',
    title: '백신(V3, 알약 등)이 차단하거나 삭제할 때',
    description:
      '백신 프로그램이 설치 파일을 위험하다고 판단한 경우예요. 더블클릭해도 아무 반응이 없다면 이 경우일 가능성이 높아요!',
    steps: [
      {
        text: (
          <>
            백신 프로그램을 열어 <strong className="text-amber-800">&quot;실시간 감시&quot;</strong>{' '}
            또는 &quot;실시간 보호&quot;를 일시 중지합니다
          </>
        ),
      },
      { text: <>설치 파일을 다시 더블클릭하여 설치합니다</> },
      {
        text: (
          <>
            설치가 끝나면 <strong className="text-amber-800">실시간 감시를 다시 켜주세요</strong>
          </>
        ),
      },
    ],
    extraTip:
      'V3: 트레이 아이콘 우클릭 → 실시간 검사 일시 중지\n알약: 트레이 아이콘 우클릭 → 실시간 감시 해제',
  },
  {
    id: 'no-response',
    icon: '😶',
    label: '아무 반응이 없어요',
    title: '더블클릭해도 아무 반응이 없을 때',
    description: '설치 파일을 실행했는데 아무 창도 안 뜨는 경우예요.',
    steps: [
      {
        text: (
          <>
            먼저 위의 <strong className="text-amber-800">&quot;백신 차단&quot;</strong> 해결법을
            시도해보세요 (가장 흔한 원인!)
          </>
        ),
      },
      {
        text: (
          <>
            그래도 안 되면: 설치 파일 우클릭 →{' '}
            <strong className="text-amber-800">&quot;관리자 권한으로 실행&quot;</strong>
          </>
        ),
      },
      {
        text: (
          <>
            여전히 안 되면: 설치 파일 우클릭 → &quot;속성&quot; →{' '}
            <strong className="text-amber-800">&quot;차단 해제&quot;</strong> 체크 → 확인 후 다시
            실행
          </>
        ),
      },
    ],
  },
];

export default function InstallGuide() {
  const [openCase, setOpenCase] = useState<string | null>(null);
  const [os, setOs] = useState<'windows' | 'mac' | 'mobile'>('windows');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/iPhone|iPad|iPod|Android/i.test(ua)) {
      setOs('mobile');
    } else if (/Macintosh|MacIntel|MacPPC|Mac68K/i.test(ua)) {
      setOs('mac');
    }
  }, []);

  const toggleCase = (id: string) => {
    setOpenCase((prev) => (prev === id ? null : id));
  };

  return (
    <section className="bg-sp-bg py-24">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn className="text-center">
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">설치는 3단계면 끝</h2>
          <p className="mt-3 text-base text-sp-muted">다운로드부터 실행까지 1분 이내</p>
        </FadeIn>

        {/*
          다운로드 탭(#download)으로 건너뛴 사람이 바로 받을 수 있게 버튼을 여기 둔다.
          2026-08-19 제보 — "'아래 버튼을 클릭해 설치 파일을 받으세요'라는 멘트는 있지만
          그 버튼이 없다." 실제로 버튼은 이 구역이 아니라 맨 아래 푸터·중간 CTA 에만 있었다.
          휴대폰에서는 바로 아래 안내와 내용이 겹쳐서 넣지 않는다.
        */}
        {os !== 'mobile' && (
          <FadeIn className="mt-8 flex justify-center" delay={0.05}>
            <DownloadButton />
          </FadeIn>
        )}

        {os === 'mobile' && (
          <FadeIn className="mt-6" delay={0.05}>
            <div className="rounded-xl border border-sp-accent/30 bg-sp-accent/5 p-4 text-center">
              <p className="text-sm font-medium text-sp-accent">
                아래 안내는 PC(Windows/macOS) 전용이에요
              </p>
              <p className="mt-1 text-xs text-sp-muted">
                교무실 PC에서 이 페이지를 열어 설치를 진행하세요
              </p>
            </div>
          </FadeIn>
        )}

        {/* 감지된 OS 설치 안내 */}
        <div className="mt-12">
          <h3 className="mb-4 text-lg font-semibold text-sp-text">
            {os === 'mac' ? '🍎 macOS 설치' : '📥 Windows 설치'}
          </h3>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {(os === 'mac' ? macSteps : steps).map((step, i) => (
              <FadeIn key={step.number} delay={i * 0.1}>
                <div className="rounded-xl border border-sp-border bg-sp-card p-7 shadow-sm">
                  <div className="mb-4 text-2xl font-extrabold tracking-tight text-sp-accent/60">
                    {step.number}
                  </div>
                  <h3 className="text-base font-bold text-sp-text">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-sp-muted">{step.description}</p>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>

        {/* 다른 OS 설치 안내 */}
        {os !== 'mobile' && (
          <div className="mt-10">
            <h3 className="mb-4 text-lg font-semibold text-sp-muted">
              {os === 'mac' ? '📥 Windows 설치' : '🍎 macOS 설치'}
            </h3>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              {(os === 'mac' ? steps : macSteps).map((step, i) => (
                <FadeIn key={`alt-${step.number}`} delay={i * 0.1}>
                  <div className="rounded-xl border border-sp-border/70 bg-sp-card/70 p-7">
                    <div className="mb-4 text-2xl font-extrabold tracking-tight text-sp-accent/40">
                      {step.number}
                    </div>
                    <h3 className="text-base font-bold text-sp-text/75">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-sp-muted/80">
                      {step.description}
                    </p>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        )}

        {/* 트러블슈팅 섹션 — Windows */}
        {os !== 'mobile' && (
          <FadeIn className={os === 'mac' ? 'mt-6' : 'mt-10'} delay={os === 'mac' ? 0.35 : 0.3}>
            <div
              className={`rounded-xl border border-amber-300/70 p-6 ${os === 'mac' ? 'bg-amber-50/60' : 'bg-amber-50'}`}
            >
              <p
                className={`text-lg font-semibold text-amber-900 ${os === 'mac' ? 'opacity-70' : ''}`}
              >
                📥 Windows 설치가 안 되시나요?
              </p>
              <p className={`mt-1.5 text-sm text-amber-800/80 ${os === 'mac' ? 'opacity-70' : ''}`}>
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
                        ? 'border-amber-500/70 bg-amber-100 text-amber-900'
                        : 'border-amber-300/60 bg-white/60 text-amber-800/80 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900'
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
                    openCase === tc.id ? 'mt-4 max-h-[1100px] opacity-100' : 'max-h-0 opacity-0'
                  }`}
                >
                  <div className="rounded-lg border border-amber-300/70 bg-white/70 p-4">
                    <p className="text-sm font-semibold text-amber-900">
                      {tc.icon} {tc.title}
                    </p>
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-800/80">
                      {tc.description}
                    </p>

                    {tc.id === 'smartscreen' && (
                      <div className="mt-4">
                        <WindowsProtectionAnimation compact />
                      </div>
                    )}

                    {tc.id !== 'smartscreen' && (
                      <ol className="mt-3 space-y-2">
                        {tc.steps.map((step, i) => (
                          <li
                            key={i}
                            className="flex items-start gap-2.5 text-xs text-amber-800/85"
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[0.65rem] font-bold text-amber-900">
                              {i + 1}
                            </span>
                            <span className="pt-0.5">{step.text}</span>
                          </li>
                        ))}
                      </ol>
                    )}

                    {tc.extraTip && (
                      <div className="mt-3 rounded-md bg-amber-50 px-3 py-2">
                        {tc.extraTip.split('\n').map((line, i) => (
                          <p key={i} className="text-[0.7rem] text-amber-800/70">
                            💡 {line}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <p className="mt-4 text-xs text-amber-800/60">
                코드 서명 인증서를 준비 중이며, 곧 경고 없이 설치하실 수 있게 됩니다.
              </p>
            </div>
          </FadeIn>
        )}

        {/* 트러블슈팅 섹션 — macOS */}
        {os !== 'mobile' && (
          <FadeIn className={os === 'mac' ? 'mt-10' : 'mt-6'} delay={os === 'mac' ? 0.3 : 0.35}>
            <div
              className={`rounded-xl border border-amber-300/70 p-6 ${os === 'mac' ? 'bg-amber-50' : 'bg-amber-50/60'}`}
            >
              <p
                className={`text-lg font-semibold text-amber-900 ${os === 'mac' ? '' : 'opacity-70'}`}
              >
                🍎 macOS에서 설치·실행이 안 되나요? (베타 지원)
              </p>
              <p className={`mt-1.5 text-sm text-amber-800/80 ${os === 'mac' ? '' : 'opacity-70'}`}>
                macOS 버전은 현재 베타로 제공돼요. Apple 인증서가 없어 보안 경고가 표시되지만, 앱
                자체는 안전합니다.
              </p>
              <div className="mt-4 rounded-lg border border-amber-300/70 bg-white/70 p-4">
                <p className="text-xs font-semibold text-amber-900">
                  A. &quot;개발자를 확인할 수 없음&quot; · &quot;손상되었기 때문에 열 수
                  없습니다&quot; 경고가 뜰 때
                </p>
                <ol className="mt-2 space-y-2">
                  <li className="flex items-start gap-2.5 text-xs text-amber-800/85">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[0.65rem] font-bold text-amber-900">
                      1
                    </span>
                    <span className="pt-0.5">
                      경고 창에서 <strong className="text-amber-900">&quot;완료&quot;</strong>를
                      클릭하세요 (&quot;휴지통으로 이동&quot;은 누르지 마세요)
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-amber-800/85">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[0.65rem] font-bold text-amber-900">
                      2
                    </span>
                    <span className="pt-0.5">
                      <strong className="text-amber-900">
                        시스템 설정 → 개인정보 보호 및 보안
                      </strong>
                      으로 이동해 아래로 스크롤하세요
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5 text-xs text-amber-800/85">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-[0.65rem] font-bold text-amber-900">
                      3
                    </span>
                    <span className="pt-0.5">
                      쌤핀 항목 옆의{' '}
                      <strong className="text-amber-900">&quot;그래도 열기&quot;</strong>를 클릭하고
                      Mac 암호를 입력하세요
                    </span>
                  </li>
                </ol>
                <p className="mt-2 text-[0.7rem] text-amber-800/60">
                  💡 예전에 안내되던 Control+클릭 → &quot;열기&quot; 방법은 최신 macOS(15 이상)에서
                  더 이상 동작하지 않아요.
                </p>
              </div>
              <div className="mt-2 rounded-lg border border-amber-300/70 bg-white/70 p-4">
                <p className="text-xs font-semibold text-amber-900">
                  B. &quot;이 버전의 macOS에서 작동하는지 확인하려면 개발자에게 문의하십시오&quot;가
                  뜰 때
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-800/85">
                  내 Mac의 칩에 맞지 않는 파일을 받은 경우예요. 🍎 메뉴 → &quot;이 Mac에
                  관하여&quot;에서 칩을 확인하세요.{' '}
                  <strong className="text-amber-900">Apple M1~M4</strong>면 Apple Silicon용,{' '}
                  <strong className="text-amber-900">Intel Core</strong>면 Intel용 DMG를 다시
                  받아주세요.
                </p>
              </div>
              <div className="mt-2 rounded-lg border border-amber-300/70 bg-white/70 p-4">
                <p className="text-xs font-semibold text-amber-900">
                  C. 위 방법으로도 &quot;손상&quot; 경고가 반복될 때
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-800/85">
                  Launchpad에서 <strong className="text-amber-900">터미널</strong>을 열고 아래
                  명령을 붙여넣은 뒤 Enter를 누르고 다시 실행해 보세요.
                </p>
                <p className="mt-1.5 rounded bg-amber-50 px-2 py-1.5 font-mono text-[0.7rem] text-amber-900">
                  xattr -cr /Applications/쌤핀.app
                </p>
              </div>
              <p className="mt-4 text-xs text-amber-800/60">
                macOS 버전은 베타로 제공되고 있어요. 문제가 계속되면 사이트 오른쪽 아래 채팅으로
                알려주세요.
              </p>
            </div>
          </FadeIn>
        )}
      </div>
    </section>
  );
}

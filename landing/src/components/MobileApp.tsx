'use client';

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import FadeIn from './FadeIn';
import { MOBILE_URL } from '@/config';

const features = [
  { icon: '📋', title: '시간표', desc: '오늘의 시간표를 한눈에' },
  { icon: '✅', title: '출결 관리', desc: '출석·결석·조퇴 간편 체크' },
  { icon: '📝', title: '메모', desc: '수업 중 빠른 메모' },
  { icon: '📌', title: '할일', desc: '업무 체크리스트' },
  { icon: '📅', title: '일정', desc: '학교 일정 확인' },
];

const installSteps = [
  { step: 1, text: '스마트폰 브라우저에서 접속', sub: 'Chrome(Android) 또는 Safari(iPhone)' },
  { step: 2, text: '"홈 화면에 추가" 선택', sub: 'Chrome: 메뉴(⋮) → 홈 화면에 추가\nSafari: 공유(↑) → 홈 화면에 추가' },
  { step: 3, text: '앱처럼 사용!', sub: '홈 화면 아이콘을 탭하면 전체 화면으로 실행' },
];

export default function MobileApp() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  return (
    <section id="mobile" className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        {/* 헤더 */}
        <FadeIn>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
              NEW
            </span>
          </div>
          <h2 className="mt-3 text-3xl font-bold text-sp-text md:text-4xl">
            모바일에서도 쌤핀
          </h2>
          <p className="mt-3 text-base text-sp-muted">
            교무실 PC의 데이터를 교실에서도 확인하세요
          </p>
        </FadeIn>

        {/* 메인 카드 */}
        <FadeIn className="mt-12" delay={0.1}>
          <div className="rounded-2xl border border-white/10 bg-sp-card p-8 md:p-12">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              {/* 왼쪽: 기능 목록 + 동기화 안내 */}
              <div>
                <h3 className="text-lg font-bold text-sp-text">주요 기능</h3>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  {features.map((f) => (
                    <div
                      key={f.title}
                      className="flex items-center gap-3 rounded-lg bg-sp-surface/50 px-4 py-3"
                    >
                      <span className="text-lg">{f.icon}</span>
                      <div>
                        <span className="text-sm font-medium text-sp-text">{f.title}</span>
                        <span className="ml-2 text-xs text-sp-muted">{f.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Google Drive 동기화 */}
                <div className="mt-6 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🔄</span>
                    <span className="text-sm font-semibold text-blue-300">
                      Google Drive로 자동 동기화
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-sp-muted">
                    PC에서 작성한 시간표·출결·메모를 Google Drive를 통해 모바일에서 바로 확인할 수 있어요.
                    별도 서버 없이 안전하게 동기화됩니다.
                  </p>
                </div>
              </div>

              {/* 오른쪽: QR코드(PC) 또는 설치 버튼(모바일) */}
              <div className="flex flex-col items-center justify-center">
                {isMobile ? (
                  /* 모바일 방문자: PC→모바일 순서 안내 + 설치 버튼 */
                  <div className="flex flex-col items-center gap-4 text-center">
                    {/* 사용 순서 안내 */}
                    <div className="w-full space-y-2.5">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-blue-400">
                        이렇게 시작하세요
                      </p>
                      <div className="flex items-start gap-3 rounded-lg bg-sp-surface/50 px-4 py-3 text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                          1
                        </span>
                        <div>
                          <p className="text-sm font-medium text-sp-text">PC 앱 설치</p>
                          <p className="text-xs text-sp-muted">교무실 PC에서 ssampin.vercel.app 접속</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-sp-surface/50 px-4 py-3 text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                          2
                        </span>
                        <div>
                          <p className="text-sm font-medium text-sp-text">데이터 입력</p>
                          <p className="text-xs text-sp-muted">시간표, 학생, 일정 등을 PC에서 입력</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 rounded-lg bg-sp-surface/50 px-4 py-3 text-left">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-400">
                          3
                        </span>
                        <div>
                          <p className="text-sm font-medium text-sp-text">모바일 동기화</p>
                          <p className="text-xs text-sp-muted">Google Drive로 교실에서 확인</p>
                        </div>
                      </div>
                    </div>

                    <a
                      href={MOBILE_URL}
                      className="mt-2 inline-flex items-center gap-2 rounded-xl bg-sp-accent px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-blue-500/30"
                    >
                      <span>📱</span>
                      모바일 앱 설치하기
                    </a>
                    <p className="text-xs text-sp-muted/60">
                      무료 · 앱 설치 불필요 · 홈 화면에 추가
                    </p>
                  </div>
                ) : (
                  /* PC 방문자: QR코드 */
                  <div className="flex flex-col items-center gap-4 text-center">
                    <div className="rounded-2xl bg-white p-4">
                      <QRCodeSVG
                        value={MOBILE_URL}
                        size={180}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#0a0e17"
                      />
                    </div>
                    <p className="text-sm font-medium text-sp-text">
                      스마트폰으로 QR코드를 스캔하세요
                    </p>
                    <p className="rounded-lg bg-sp-surface px-4 py-2 font-mono text-xs text-sp-muted">
                      {MOBILE_URL.replace('https://', '')}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </FadeIn>

        {/* 설치 가이드 */}
        <FadeIn className="mt-10" delay={0.2}>
          <h3 className="text-center text-lg font-bold text-sp-text">설치 방법</h3>
          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            {installSteps.map((s, i) => (
              <FadeIn key={s.step} delay={0.25 + i * 0.1}>
                <div className="rounded-xl border border-sp-border bg-sp-card p-5 text-center">
                  <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-sp-accent/20 text-sm font-bold text-blue-400">
                    {s.step}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-sp-text">{s.text}</p>
                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-sp-muted">
                    {s.sub}
                  </p>
                </div>
              </FadeIn>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

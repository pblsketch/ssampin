'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { QRCodeSVG } from 'qrcode.react';
import FadeIn from './FadeIn';
import { MOBILE_URL } from '@/config';

const widgetPoints = [
  '시간표 + 일정 + 급식 한눈에',
  '4가지 레이아웃 (단일/가로/세로/4분할)',
  '투명도 조절 + 항상 위 표시',
];

export default function Anywhere() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  return (
    <section className="bg-sp-bg py-20">
      <div className="mx-auto max-w-6xl px-6">
        <FadeIn>
          <p className="mb-3 text-[0.7rem] font-semibold uppercase tracking-widest text-sp-accent">
            어디서든
          </p>
          <h2 className="text-3xl font-bold text-sp-text md:text-4xl">
            데스크톱 위에도, 교실에서도
          </h2>
          <p className="mt-3 text-base text-sp-muted">
            미니 위젯으로 띄워두거나, 모바일로 교실에서 확인하세요
          </p>
        </FadeIn>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* 위젯 모드 */}
          <FadeIn delay={0.08}>
            <div className="h-full rounded-2xl border border-white/10 bg-sp-card p-7">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xl">🖥️</span>
                <h3 className="text-base font-bold text-sp-text">위젯 모드</h3>
              </div>
              <div className="mb-5 overflow-hidden rounded-xl border border-white/10">
                <Image
                  src="/images/widget-mode.png"
                  alt="쌤핀 위젯 모드 - 데스크톱 위에 띄운 대시보드"
                  width={1920}
                  height={1080}
                  className="h-auto w-full"
                />
              </div>
              <ul className="space-y-2.5">
                {widgetPoints.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs text-blue-400">
                      ✓
                    </span>
                    <span className="text-sp-text/80">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>

          {/* 모바일 */}
          <FadeIn delay={0.16}>
            <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-sp-card p-7">
              <div className="mb-4 flex items-center gap-2">
                <span className="text-xl">📱</span>
                <h3 className="text-base font-bold text-sp-text">모바일</h3>
                <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-[0.65rem] font-semibold text-blue-400">
                  NEW
                </span>
              </div>
              <p className="mb-4 text-sm text-sp-muted">
                교무실 PC의 데이터를 교실에서도 확인하세요.
                <br />
                Google Drive로 안전하게 동기화됩니다.
              </p>
              <ul className="mb-6 space-y-2">
                {['시간표·출결·메모 확인', '홈 화면에 추가 (PWA)', 'Google Drive 동기화'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs text-blue-400">
                      ✓
                    </span>
                    <span className="text-sp-text/80">{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-auto flex flex-col items-center gap-3 pt-4">
                {isMobile ? (
                  <a
                    href={MOBILE_URL}
                    className="inline-flex items-center gap-2 rounded-xl bg-sp-accent px-6 py-3 text-sm font-bold text-white transition-all hover:-translate-y-0.5 hover:bg-blue-500"
                  >
                    📱 모바일 앱 열기
                  </a>
                ) : (
                  <>
                    <div className="rounded-xl bg-white p-3">
                      <QRCodeSVG
                        value={MOBILE_URL}
                        size={120}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#0a0e17"
                      />
                    </div>
                    <p className="text-xs text-sp-muted">
                      스마트폰으로 QR코드를 스캔하세요
                    </p>
                  </>
                )}
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

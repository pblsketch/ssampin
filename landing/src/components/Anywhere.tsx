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
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-card shadow-sm">
              <div className="flex items-center gap-2 px-6 pb-3 pt-6">
                <span className="text-xl">🖥️</span>
                <h3 className="text-base font-bold text-sp-text">위젯 모드</h3>
              </div>
              <div className="border-y border-sp-border bg-sp-surface">
                <Image
                  src="/images/widget-mode.png"
                  alt="쌤핀 위젯 모드 - 데스크톱 위에 띄운 대시보드"
                  width={956}
                  height={1027}
                  className="h-auto w-full"
                />
              </div>
              <ul className="space-y-2.5 px-6 py-5">
                {widgetPoints.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sp-accent/15 text-xs text-sp-accent">
                      ✓
                    </span>
                    <span className="text-sp-text/85">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeIn>

          {/* 모바일 */}
          <FadeIn delay={0.16}>
            <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-card shadow-sm">
              <div className="flex items-center gap-2 px-6 pb-3 pt-6">
                <span className="text-xl">📱</span>
                <h3 className="text-base font-bold text-sp-text">모바일</h3>
                <span className="ml-2 rounded-full bg-sp-accent/10 px-2 py-0.5 text-[0.65rem] font-semibold text-sp-accent">
                  NEW
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-5 border-t border-sp-border bg-sp-surface px-6 py-6 md:flex-row md:items-center">
                <div className="flex shrink-0 justify-center md:justify-start">
                  <div className="overflow-hidden rounded-[2rem] border border-sp-border bg-sp-card p-1 shadow-lg shadow-slate-900/15 ring-1 ring-sp-border/60">
                    <Image
                      src="/images/mobile.png"
                      alt="쌤핀 모바일 - 교실에서 확인하는 시간표·출결·메모"
                      width={673}
                      height={1383}
                      className="h-auto w-[200px] rounded-[1.75rem] md:w-[180px]"
                    />
                  </div>
                </div>
                <div className="flex flex-1 flex-col">
                  <p className="text-sm leading-relaxed text-sp-muted">
                    교무실 PC의 데이터를 교실에서도 확인하세요. Google Drive 앱 전용 폴더에 안전하게
                    백업됩니다.
                  </p>
                  <ul className="mt-4 space-y-2">
                    {[
                      '시간표·출결·메모 확인',
                      '홈 화면에 추가 (PWA)',
                      'Google Drive 앱 폴더 백업',
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sp-accent/15 text-xs text-sp-accent">
                          ✓
                        </span>
                        <span className="text-sp-text/85">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="flex items-center justify-center gap-4 px-6 py-5">
                {isMobile ? (
                  <a
                    href={MOBILE_URL}
                    className="inline-flex items-center gap-2 rounded-xl bg-sp-accent px-6 py-3 text-sm font-bold text-white shadow-md shadow-sp-accent/20 transition-all hover:-translate-y-0.5 hover:bg-sp-accent-hover"
                  >
                    📱 모바일 앱 열기
                  </a>
                ) : (
                  <>
                    <div className="rounded-xl border border-sp-border bg-white p-2">
                      <QRCodeSVG
                        value={MOBILE_URL}
                        size={88}
                        level="M"
                        bgColor="#ffffff"
                        fgColor="#1a1612"
                      />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-sp-text">QR로 바로 열기</p>
                      <p className="mt-0.5 text-xs text-sp-muted">스마트폰으로 스캔하세요</p>
                    </div>
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

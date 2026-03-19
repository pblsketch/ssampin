'use client';

import { useEffect, useState } from 'react';
import { DOWNLOAD_URL, VERSION, FILE_SIZE, FALLBACK_DOWNLOAD_URL, MOBILE_URL } from '@/config';

interface DownloadButtonProps {
  variant?: 'primary' | 'white';
  showSmartScreenFaq?: boolean;
}

export default function DownloadButton({ variant = 'primary', showSmartScreenFaq = false }: DownloadButtonProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileInstall, setShowMobileInstall] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText('https://ssampin.vercel.app');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: do nothing
    }
  };

  if (isMobile) {
    return (
      <div className="flex flex-col items-center gap-4">
        {!showMobileInstall ? (
          <>
            {/* PC 우선 설치 안내 */}
            <div className="w-full max-w-md rounded-xl border border-blue-500/20 bg-blue-500/5 p-5 text-center">
              <p className="text-sm font-bold text-blue-300">
                PC 앱을 먼저 설치해 주세요
              </p>
              <p className="mt-2 text-xs leading-relaxed text-sp-muted">
                쌤핀 모바일은 교무실 PC의 데이터를 교실에서 확인하는
                <br className="hidden sm:inline" />
                {' '}보조 앱이에요. PC에서 먼저 데이터를 입력해야 해요.
              </p>
              <div className="mt-3 flex items-center justify-center gap-2">
                <span className="rounded-lg bg-sp-surface px-3 py-1.5 font-mono text-xs text-sp-muted">
                  ssampin.vercel.app
                </span>
                <button
                  type="button"
                  onClick={handleCopyUrl}
                  className="rounded-lg bg-sp-accent/20 px-3 py-1.5 text-xs font-medium text-blue-300 transition-colors hover:bg-sp-accent/30"
                >
                  {copied ? '복사됨!' : '복사'}
                </button>
              </div>
              <p className="mt-2 text-[0.7rem] text-sp-muted/60">
                교무실 PC에서 위 주소로 접속하세요
              </p>
            </div>

            {/* 이미 PC에 설치한 사용자용 */}
            <button
              type="button"
              onClick={() => setShowMobileInstall(true)}
              className="text-sm text-sp-muted underline underline-offset-2 transition-colors hover:text-sp-text"
            >
              이미 PC에 설치했어요 →
            </button>
          </>
        ) : (
          <>
            <a
              href={MOBILE_URL}
              className="inline-flex items-center gap-2 rounded-xl bg-sp-accent px-8 py-4 text-lg font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:-translate-y-0.5 hover:bg-blue-500 hover:shadow-blue-500/30"
            >
              <span>📱</span>
              <span>모바일 앱 설치하기</span>
            </a>
            <p className="text-sm text-sp-muted">무료 · 앱 설치 불필요 · 홈 화면에 추가</p>
          </>
        )}
        <button
          type="button"
          onClick={() => document.getElementById('mobile')?.scrollIntoView({ behavior: 'smooth' })}
          className="text-xs text-sp-muted/70 underline underline-offset-2 transition-colors hover:text-sp-muted"
        >
          자세히 알아보기 ↓
        </button>
      </div>
    );
  }

  const isPrimary = variant === 'primary';

  return (
    <div className="flex flex-col items-center gap-3">
      <a
        href={DOWNLOAD_URL}
        className={`inline-flex items-center gap-2 rounded-xl px-8 py-4 text-lg font-bold transition-all hover:-translate-y-0.5 ${
          isPrimary
            ? 'bg-sp-accent text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 hover:shadow-blue-500/30'
            : 'bg-white text-blue-700 shadow-lg hover:bg-blue-50'
        }`}
      >
        <span>📥</span>
        <span>
          {isPrimary ? `Windows 다운로드 (v${VERSION})` : '무료 다운로드 (Windows)'}
        </span>
      </a>
      <p className={`text-sm ${isPrimary ? 'text-sp-muted' : 'text-blue-100/70'}`}>
        무료 · Windows 10/11 · 설치 파일 {FILE_SIZE}
      </p>
      <p className={`text-xs ${isPrimary ? 'text-sp-muted/60' : 'text-blue-100/50'}`}>
        다운로드가 안 되시나요?{' '}
        <a
          href={FALLBACK_DOWNLOAD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 hover:opacity-100 transition-opacity ${
            isPrimary ? 'text-sp-muted/80 hover:text-sp-muted' : 'text-blue-100/70 hover:text-blue-100'
          }`}
        >
          여기서 받으세요 →
        </a>
      </p>

      {showSmartScreenFaq && (
        <details className="group mt-3 w-full max-w-md rounded-xl border border-amber-500/20 bg-amber-500/5 text-left">
          <summary className="flex min-h-[44px] cursor-pointer items-center gap-2 px-4 py-3 text-[0.85rem] font-medium text-amber-200/90 select-none">
            <span>⚠️</span>
            <span className="flex-1">다운로드 시 보안 경고가 뜨나요?</span>
            <span className="shrink-0 text-amber-200/50 transition-transform duration-200 group-open:rotate-45">
              +
            </span>
          </summary>

          <div className="border-t border-amber-500/10 px-4 pb-4 pt-3 text-[0.8rem] leading-relaxed text-amber-200/70">
            <p>
              걱정 마세요! 쌤핀은 안전한 프로그램입니다.
              <br />
              개인 개발 앱이라 아직 Microsoft 인증서가 없어서 경고가 표시돼요.
            </p>

            <div className="mt-3 space-y-2">
              <div className="rounded-lg bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-300">
                  A. &quot;Windows의 PC 보호&quot; 화면이 뜰 때
                </p>
                <ol className="mt-1.5 space-y-1 text-xs text-amber-200/60">
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">1</span>
                    <span><strong className="text-amber-200/80">&quot;추가 정보&quot;</strong>를 클릭합니다</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">2</span>
                    <span><strong className="text-amber-200/80">&quot;실행&quot;</strong> 버튼을 클릭합니다</span>
                  </li>
                </ol>
              </div>

              <div className="rounded-lg bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-300">
                  B. &quot;스마트 앱 컨트롤이 차단&quot; 화면이 뜰 때 (Win 11)
                </p>
                <ol className="mt-1.5 space-y-1 text-xs text-amber-200/60">
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">1</span>
                    <span>설치 파일 우클릭 → <strong className="text-amber-200/80">&quot;속성&quot;</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">2</span>
                    <span>하단 <strong className="text-amber-200/80">&quot;차단 해제&quot;</strong> 체크 → 확인</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">3</span>
                    <span>설치 파일 다시 실행</span>
                  </li>
                </ol>
              </div>
              <div className="rounded-lg bg-amber-500/5 p-3">
                <p className="text-xs font-semibold text-amber-300">
                  C. 더블클릭해도 아무 반응이 없을 때
                </p>
                <ol className="mt-1.5 space-y-1 text-xs text-amber-200/60">
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">1</span>
                    <span>백신(V3, 알약 등)의 <strong className="text-amber-200/80">&quot;실시간 감시&quot;</strong>를 일시 중지</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">2</span>
                    <span>설치 파일 다시 더블클릭</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-[0.6rem] font-bold text-amber-300">3</span>
                    <span>설치 완료 후 <strong className="text-amber-200/80">실시간 감시 다시 켜기</strong></span>
                  </li>
                </ol>
              </div>
            </div>

            <p className="mt-3 text-[0.7rem] text-amber-200/40">
              사용자가 늘어나면 이 경고는 자연스럽게 사라집니다.
            </p>
          </div>
        </details>
      )}
    </div>
  );
}

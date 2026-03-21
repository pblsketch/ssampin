import { useState, useEffect } from 'react';
import { detectInAppBrowser } from '@infrastructure/browser/detectInAppBrowser';

export function InAppBrowserBanner() {
  const [browserInfo, setBrowserInfo] = useState<{ isInApp: boolean; appName: string | null }>({
    isInApp: false,
    appName: null,
  });
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setBrowserInfo(detectInAppBrowser());
  }, []);

  if (!browserInfo.isInApp || dismissed) return null;

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-amber-500 text-black px-4 py-3 shadow-lg">
      <div className="flex items-start gap-3 max-w-lg mx-auto">
        <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">
            {browserInfo.appName ?? '앱 내'} 브라우저에서 접속하셨어요
          </p>
          <p className="text-xs mt-1 opacity-90">
            Google 로그인이 정상 작동하지 않을 수 있어요.{' '}
            {isIOS ? (
              <>하단의 <strong>Safari로 열기</strong> 버튼을 눌러주세요.</>
            ) : (
              <>우측 상단 <strong>⋮ → 브라우저에서 열기</strong>를 눌러주세요.</>
            )}
          </p>

          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                alert('URL이 복사되었어요!\n크롬 또는 사파리에 붙여넣기 해주세요.');
              }}
              className="px-3 py-1.5 bg-black/20 rounded-lg text-xs font-bold"
            >
              URL 복사하기
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="px-3 py-1.5 bg-black/10 rounded-lg text-xs"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';

type Platform = 'ios' | 'android' | 'unknown';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'unknown';
}

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as unknown as { standalone?: boolean }).standalone === true;
}

const DISMISS_KEY = 'install-guide-dismissed';

export function InstallGuide() {
  const [show, setShow] = useState(false);
  const [platform] = useState(detectPlatform);
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // beforeinstallprompt 이벤트 캡처 (Android Chrome 등)
    const handlePrompt = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
      // 프롬프트가 가능하면 즉시 표시
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handlePrompt);

    // 프롬프트 이벤트가 없는 브라우저(iOS 등)는 타이머로 표시
    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (!dismissed) {
      const timer = setTimeout(() => setShow(true), 3000);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('beforeinstallprompt', handlePrompt);
      };
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    }
    deferredPrompt.current = null;
    setCanInstall(false);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 glass-card p-4 animate-slide-up">
      <div className="flex items-start gap-3">
        <span className="text-2xl shrink-0">📲</span>
        <div className="flex-1 min-w-0">
          <p className="text-sp-text font-bold text-sm">홈 화면에 추가하면 앱처럼 사용할 수 있어요</p>
          {canInstall ? (
            <button
              onClick={handleInstall}
              className="mt-2 px-4 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              앱 설치하기
            </button>
          ) : platform === 'ios' ? (
            <p className="text-sp-muted text-xs mt-1">
              Safari 하단의 <strong className="text-sp-text">공유 버튼</strong>(□↑)을 누르고 → <strong className="text-sp-text">&quot;홈 화면에 추가&quot;</strong>를 탭하세요
            </p>
          ) : platform === 'android' ? (
            <p className="text-sp-muted text-xs mt-1">
              Chrome 상단의 <strong className="text-sp-text">⋮ 메뉴</strong>를 누르고 → <strong className="text-sp-text">&quot;홈 화면에 추가&quot;</strong> 또는 <strong className="text-sp-text">&quot;앱 설치&quot;</strong>를 탭하세요
            </p>
          ) : (
            <p className="text-sp-muted text-xs mt-1">
              브라우저 메뉴에서 <strong className="text-sp-text">&quot;홈 화면에 추가&quot;</strong>를 찾아 탭하세요
            </p>
          )}
        </div>
        <button
          onClick={dismiss}
          className="text-sp-muted hover:text-sp-text text-xs p-1 shrink-0"
        >
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  );
}

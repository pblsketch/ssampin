import { useState, useEffect } from 'react';

const SEEN_KEY = 'mobile-nav-v2-coachmark';

/**
 * 하단 탭 6→4 재편 후 첫 실행 1회 안내. dismiss 시 localStorage 플래그.
 * (온보딩을 처음 보는 신규 사용자에게는 의미가 없으므로 onboarding-completed 가 있을 때만 표시.)
 */
export function NavMigrationCoachmark() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      const onboarded = localStorage.getItem('onboarding-completed');
      const seen = localStorage.getItem(SEEN_KEY);
      if (onboarded && !seen) {
        const t = setTimeout(() => setShow(true), 400);
        return () => clearTimeout(t);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-6"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-sm glass-card rounded-xl p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="메뉴 변경 안내"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-sp-accent text-icon-xl">
            auto_awesome
          </span>
          <h3 className="text-base font-bold text-sp-text">메뉴를 정리했어요</h3>
        </div>
        <ul className="space-y-2 text-sm text-sp-muted">
          <li className="flex gap-2">
            <span className="text-sp-accent">·</span>
            <span>
              <span className="text-sp-text font-medium">담임·수업</span>은{' '}
              <span className="text-sp-text font-medium">'학생'</span> 탭 안으로 합쳤어요.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-sp-accent">·</span>
            <span>
              <span className="text-sp-text font-medium">일정·할 일</span>도{' '}
              <span className="text-sp-text font-medium">'일정'</span> 탭에서 같이 봐요.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-sp-accent">·</span>
            <span>
              새 항목 추가는 우측 아래 <span className="text-sp-text font-medium">[+] 버튼</span>
              으로요.
            </span>
          </li>
        </ul>
        <button
          type="button"
          onClick={dismiss}
          className="mt-5 h-11 w-full rounded-xl bg-sp-accent text-sm font-medium text-sp-accent-fg transition-transform active:scale-[0.98]"
        >
          확인
        </button>
      </div>
    </div>
  );
}

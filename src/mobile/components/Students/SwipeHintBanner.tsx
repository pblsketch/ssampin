import { useState } from 'react';

const DISMISS_KEY = 'ssampin-swipe-coachmark-dismissed';

function alreadyDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * 담임반 명단 위에 한 번 떠 있는 스와이프 사용법 배너. ✕ 를 누르면 localStorage 에 기억되어 다시 안 뜬다.
 * 스와이프를 못/안 쓰는 사용자는 그냥 무시하고 행을 탭하면 기존 시트가 그대로 열린다(기능 손실 없음).
 */
export function SwipeHintBanner() {
  const [hidden, setHidden] = useState(alreadyDismissed);

  if (hidden) return null;

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-sp-accent/20 bg-sp-accent/8 px-3 py-2.5">
      <span className="material-symbols-outlined mt-0.5 shrink-0 text-base text-sp-accent">
        swipe
      </span>
      <p className="flex-1 text-xs leading-relaxed text-sp-text">
        학생 행을 좌우로 밀어보세요. <span className="font-medium">오른쪽 →</span> 칭찬 메모,{' '}
        <span className="font-medium">왼쪽 ←</span> 지각·결석 빠른 기록. 드러난 버튼을 한 번 더
        누르면 기록됩니다.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="안내 닫기"
        className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-sp-muted active:bg-sp-card"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}

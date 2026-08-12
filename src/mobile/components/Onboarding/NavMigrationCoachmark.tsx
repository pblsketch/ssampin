import { useState, useEffect } from 'react';

/**
 * ⚠️ 키에 버전이 붙어 있는 이유 — 안내 내용이 바뀌면 키도 올려야 한다.
 * v2 안내("담임·수업을 '학생' 탭으로 합쳤어요")를 이미 본 사용자는 플래그가 남아 있어,
 * 키를 그대로 두면 이번 v3 안내를 영영 못 본다. 그 사용자에게는 지난 안내가 사실과
 * 반대가 되므로 반드시 다시 알려야 한다.
 */
const SEEN_KEY = 'mobile-nav-v3-coachmark';

/**
 * 하단 탭 재편 후 첫 실행 1회 안내. dismiss 시 localStorage 플래그.
 * (온보딩을 처음 보는 신규 사용자에게는 의미가 없으므로 onboarding-completed 가 있을 때만 표시.)
 *
 * v2: 6→4 재편 — 담임·수업을 '학생' 탭으로 합침
 * v3: 4→5 재편 — '학급'과 '수업'을 각자 탭으로 분리(저장소·폴더가 원래 나뉘어 있었다)
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
              <span className="text-sp-text font-medium">'학급'</span>과{' '}
              <span className="text-sp-text font-medium">'수업'</span>이 각각 탭이 됐어요. 담임 일과
              수업 일을 섞지 않고 따로 봐요.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-sp-accent">·</span>
            <span>
              담임을 맡지 않으셨다면{' '}
              <span className="text-sp-text font-medium">설정 &gt; 하단 탭 표시</span>에서 '학급'을
              끌 수 있어요.
            </span>
          </li>
          <li className="flex gap-2">
            <span className="text-sp-accent">·</span>
            <span>
              <span className="text-sp-text font-medium">일정·할 일</span>은 그대로{' '}
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

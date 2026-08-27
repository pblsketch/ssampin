import { Kbd } from '@adapters/components/common/Kbd';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { useCommandRecentStore } from '@adapters/stores/useCommandRecentStore';

/**
 * 명령 팔레트(Ctrl/⌘+K) 첫 사용 안내 노출 판정 — 순수 함수(테스트 용이).
 *
 * 온보딩이 끝났고(loaded && !isFirstRun), 안내를 닫지 않았으며,
 * 팔레트를 아직 한 번도 쓰지 않은(recentCount === 0) 사용자에게만 보여준다.
 */
export function shouldShowCommandHint(p: {
  loaded: boolean;
  isFirstRun: boolean;
  hintDismissed: boolean;
  recentCount: number;
}): boolean {
  return p.loaded && !p.isFirstRun && !p.hintDismissed && p.recentCount === 0;
}

/** 팔레트를 직접 열 수 없는 위치에서도 열도록, 전역 Ctrl+K 키 이벤트를 흉내 낸다. */
function openCommandPalette(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
}

export function CommandPaletteHint() {
  const loaded = useSettingsStore((s) => s.loaded);
  const isFirstRun = useSettingsStore((s) => s.isFirstRun);
  const hintDismissed = useCommandRecentStore((s) => s.hintDismissed);
  const recentCount = useCommandRecentStore((s) => s.recentIds.length);
  const dismissHint = useCommandRecentStore((s) => s.dismissHint);

  if (!shouldShowCommandHint({ loaded, isFirstRun, hintDismissed, recentCount })) return null;

  const handleOpen = () => {
    openCommandPalette();
    dismissHint();
  };

  return (
    <div
      role="status"
      data-sp-floating
      className="fixed bottom-6 right-6 z-sp-toast w-[330px] max-w-[calc(100vw-2rem)] rounded-xl border border-sp-border bg-sp-card p-4 shadow-xl animate-fade-in"
    >
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined shrink-0 text-sp-accent">bolt</span>
        <div className="flex-1">
          <p className="mb-1 text-sm font-sp-semibold text-sp-text">빠른 이동·검색 팁</p>
          <p className="text-detail leading-relaxed text-sp-muted">
            <Kbd combo="Ctrl+K" /> 를 누르면 어디든 빠르게 이동하고, 자리 배치·빠른 추가 같은 기능을
            바로 실행할 수 있어요. 초성(예:{' '}
            <span className="font-sp-medium text-sp-text">ㅅㄱㅍ</span>
            )으로도 찾을 수 있어요.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpen}
              className="h-8 rounded-md bg-sp-accent px-3 text-detail font-sp-medium text-white transition-opacity hover:opacity-90"
            >
              지금 열기
            </button>
            <button
              type="button"
              onClick={dismissHint}
              className="h-8 rounded-md px-3 text-detail font-sp-medium text-sp-muted transition-colors hover:bg-sp-text/5"
            >
              닫기
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismissHint}
          aria-label="안내 닫기"
          className="shrink-0 rounded-md p-1 text-sp-muted transition-colors hover:bg-sp-text/5"
        >
          <span className="material-symbols-outlined text-icon-sm">close</span>
        </button>
      </div>
    </div>
  );
}

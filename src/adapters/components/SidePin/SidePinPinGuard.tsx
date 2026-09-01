/**
 * 옆핀 위젯 칸의 PIN 잠금 — 잠긴 위젯은 **그리지 않는다.**
 *
 * ## 왜 대시보드 것을 그대로 안 쓰는가
 *
 * `DashboardPinGuard`는 `Card`로 감싸 `min-h-[96px]` + `py-8`을 쓴다. 대시보드 타일에는
 * 맞지만 옆핀 목록의 한 줄(요약 높이)에서는 세로로 터져, 잠긴 위젯이 안 잠긴 위젯보다
 * 훨씬 커진다. **판단하는 규칙은 같고 껍데기만 옆핀 치수로 다시 만들었다.**
 *
 * ## 가리는 게 아니라 안 만든다
 *
 * 잠기면 본문 컴포넌트를 **렌더 트리에 넣지 않는다.** `display:none`으로 가리기만 하면
 * 값이 화면 쪽 메모리에 남아 개발자 도구나 화면 공유로 새어 나가고, 위젯이 데이터까지
 * 불러온다. 메모 칸이 `useSidePinMemos(locked, …)`로 아예 안 부르는 것과 같은 규칙이다.
 *
 * ## 해제 상태는 이 창이 기억하지 않는다
 *
 * 패널 창은 접힌 뒤 10초면 파괴된다. 여기서 기억하면 그때 함께 사라져 **스칠 때마다
 * PIN을 다시 묻는다.** 그래서 창(상태 기계)이 들고 있는 `pinUnlockedAt`을 받아 쓴다.
 */
import { useEffect, useState, type ReactNode } from 'react';
import type { ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { PinOverlay } from '@adapters/components/common/PinOverlay';
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';
import { useSidePinFeatureLock } from './useSidePinFeatureLock';

/** 판단 규칙은 `useSidePinFeatureLock` 이 정본이다. 옛 호출부를 위해 다시 내보낸다. */
export { SIDE_PIN_UNLOCK_MAX_AGE_MS } from './useSidePinFeatureLock';

export interface SidePinPinGuardProps {
  readonly feature: ProtectedFeatureKey;
  /** 창이 들고 있는 "마지막으로 푼 시각". 안 풀었으면 null */
  readonly pinUnlockedAt: number | null;
  /** PIN 을 풀었다고 창에 알린다. 이게 있어야 다음에 다시 안 묻는다 */
  readonly onUnlocked?: () => void;
  /**
   * PIN 을 치는 동안 "쓰는 중"을 걸어 패널이 접히지 않게 한다.
   *
   * 없으면 숫자를 누르는 사이 마우스가 벗어나 **패널이 접히고 입력이 날아간다.**
   * 이 패널에서 접힘이 문제가 된 다섯 번째 자리다.
   */
  readonly onEditorActivityChange?: (busy: boolean) => void;
  readonly children: ReactNode;
}

export function SidePinPinGuard({
  feature,
  pinUnlockedAt,
  onUnlocked,
  onEditorActivityChange,
  children,
}: SidePinPinGuardProps) {
  const [showOverlay, setShowOverlay] = useState(false);
  const { undecided, locked, markUnlocked } = useSidePinFeatureLock(feature, pinUnlockedAt);

  // PIN 판을 띄운 동안에는 접히지 않게 잡아 둔다. 떠날 때는 반드시 놓는다.
  useEffect(() => {
    return () => onEditorActivityChange?.(false);
  }, [onEditorActivityChange]);

  const overlayVisible = locked && showOverlay;

  useEffect(() => {
    onEditorActivityChange?.(overlayVisible);
  }, [overlayVisible, onEditorActivityChange]);

  if (undecided) return null;
  if (!locked) return <>{children}</>;

  return (
    <>
      <button
        type="button"
        onClick={() => setShowOverlay(true)}
        aria-label="잠금 해제"
        className={`flex w-full items-center gap-1.5 rounded-lg bg-sp-bg px-2 py-2 text-left text-sp-muted transition-colors duration-sp-quick hover:text-sp-text ${SIDE_PIN_MEMO_FOCUS}`}
      >
        <span aria-hidden className="material-symbols-outlined text-icon-sm leading-none">
          lock
        </span>
        <span className="min-w-0 flex-1 truncate text-caption">잠금됨 · 눌러서 보기</span>
      </button>

      {overlayVisible && (
        <PinOverlay
          onSuccess={() => {
            setShowOverlay(false);
            /**
             * 🚨 **먼저 여기서 연다. 창의 답을 기다리지 않는다.**
             *
             * 처음에는 "통로가 있으면 창이 정본"이라며 이 줄을 조건부로 만들었다가
             * **PIN 을 맞춰도 안 열리는 상태**를 만들었다(2026-09-01 실기기).
             * `onUnlocked` 는 항상 있는 함수라 조건이 절대 참이 되지 않았고,
             * 그 안의 `reportPinUnlocked` 가 없으면(옛 preload·브라우저 모드)
             * **조용히 아무 일도 안 일어났다.**
             *
             * 교훈: "통로가 있는가"를 **콜백이 있는가**로 판단하면 안 된다.
             * 지금은 무조건 연다 — 창이 답을 주면 그 값이 이어받고(패널이 파괴돼도 살아남고),
             * 안 주면 이 창에서만 열린 채로 남는다. 어느 쪽이든 **잠긴 채로 갇히지 않는다.**
             */
            markUnlocked();
            onUnlocked?.();
          }}
          onCancel={() => setShowOverlay(false)}
        />
      )}
    </>
  );
}

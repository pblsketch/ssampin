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
import type { PinSettings, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';
import { PinOverlay } from '@adapters/components/common/PinOverlay';
import { SIDE_PIN_MEMO_FOCUS } from './SidePinMemoList';

/**
 * 한 번 풀면 이만큼까지만 유효하다.
 *
 * 이건 대시보드식 "시간 기반 자동 잠금"이 아니다. 옆핀의 재잠금 기준은 **사건**
 * (잠금·절전·발표가 걸렸다 풀릴 때)이고, 이 값은 그 사건이 하루 종일 한 번도 없을 때
 * 해제가 영원히 남는 것을 막는 안전핀일 뿐이다. 그래서 12시간으로 길게 잡는다 —
 * 짧게 잡으면 결국 시간 기반 잠금이 되어 선생님이 잠금을 꺼 버린다.
 */
export const SIDE_PIN_UNLOCK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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

/** 지금 이 기능이 잠금 대상인가 — 설정이 실린 뒤에만 답할 수 있다 */
function isFeatureLocked(settings: PinSettings, feature: ProtectedFeatureKey): boolean {
  if (!settings.enabled || settings.pinHash === null) return false;
  return settings.protectedFeatures[feature] === true;
}

export function SidePinPinGuard({
  feature,
  pinUnlockedAt,
  onUnlocked,
  onEditorActivityChange,
  children,
}: SidePinPinGuardProps) {
  const loaded = useSettingsStore((s) => s.loaded);
  const pin = useSettingsStore((s) => s.settings.pin);
  const [showOverlay, setShowOverlay] = useState(false);
  /**
   * 이 창에서 방금 PIN 을 맞췄다 — **창의 답을 기다리지 않고 바로 연다.**
   *
   * 창(상태 기계)이 정본이지만, 그 답을 기다렸다가 열면 통로가 없는 환경
   * (옛 preload·브라우저 모드)에서 **영영 안 열린다.** 실제로 그렇게 만들어 봤다가
   * "PIN 을 맞춰도 안 열린다"는 신고를 받았다.
   *
   * 다시 잠글 때 함께 내려가야 한다 — 아래 두 effect 가 그 일을 한다.
   */
  const [justUnlocked, setJustUnlocked] = useState(false);

  /**
   * 창이 "잠겼다"고 하면 임시 해제도 함께 내린다.
   *
   * 본 앱에서 "지금 잠그기"를 누르거나 보호가 풀려 재잠금이 걸린 경우다.
   * 이게 없으면 패널이 떠 있는 동안 계속 열려 있다.
   */
  useEffect(() => {
    if (pinUnlockedAt === null) setJustUnlocked(false);
  }, [pinUnlockedAt]);

  // PIN 판을 띄운 동안에는 접히지 않게 잡아 둔다. 떠날 때는 반드시 놓는다.
  useEffect(() => {
    return () => onEditorActivityChange?.(false);
  }, [onEditorActivityChange]);

  /**
   * 설정이 아직 안 실렸으면 **아무것도 그리지 않는다.**
   *
   * 이때는 "잠글 기능인지"를 알 방법이 없다. 기본값(`pin.enabled === false`)을 믿고
   * 본문을 그리면, 설정이 실리기 전 몇 프레임 동안 **잠근 위젯이 그대로 보이고
   * 데이터까지 불러온다.** 자물쇠를 그리는 것도 답이 아니다 — PIN 을 안 쓰는 선생님
   * 전원에게 자물쇠가 번쩍인다. 그래서 판단이 설 때까지 비워 둔다.
   */
  const undecided = !loaded;
  const featureLocked = !undecided && isFeatureLocked(pin, feature);

  /**
   * 만료는 **그릴 때마다** 잰다. 창이 상태를 다시 안 밀어도 시간은 흐르므로,
   * 창에 물어보는 방식이면 만료가 늦게 걸린다.
   */
  const stillUnlocked =
    pinUnlockedAt !== null && Date.now() - pinUnlockedAt < SIDE_PIN_UNLOCK_MAX_AGE_MS;

  const locked = featureLocked && !stillUnlocked && !justUnlocked;
  /**
   * PIN 판이 **실제로 화면에 있는가.** `showOverlay` 만 보면 안 된다 —
   * 잠금이 풀리거나 설정이 바뀌어 자물쇠 자체가 사라져도 그 값은 참으로 남아,
   * "쓰는 중"이 걸린 채 **옆핀이 영영 안 접힌다.** 1단계에서 같은 종류로 한 번 데었다.
   */
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
            setJustUnlocked(true);
            onUnlocked?.();
          }}
          onCancel={() => setShowOverlay(false)}
        />
      )}
    </>
  );
}

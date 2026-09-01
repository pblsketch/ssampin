/**
 * 옆핀에서 어떤 기능이 지금 PIN 으로 잠겨 있는가 — **판단 규칙의 정본.**
 *
 * 위젯 칸과 메모 칸이 **같은 규칙**을 써야 한다. 규칙을 각자 복사해 두면 한쪽만 고쳐져
 * 어긋나는데, 어긋나는 쪽이 하필 "안 잠겼다"라서 조용한 구멍이 된다. 그래서 한 곳에 둔다.
 *
 * 여기서 정하는 것은 세 가지다:
 *  1. **설정이 아직 안 실렸으면 판단하지 않는다**(`undecided`). 기본값을 믿고 열어 주면
 *     설정이 실리기 전 몇 프레임 동안 잠근 내용이 그대로 보이고 데이터까지 불러온다.
 *  2. **해제 시각은 창(상태 기계)이 준 값을 쓴다.** 이 창이 기억하면 패널이 파괴될 때
 *     함께 사라져 스칠 때마다 PIN 을 다시 묻는다.
 *  3. **만료는 그릴 때마다 잰다.** 상태가 안 밀려도 시간은 흐른다.
 */
import { useEffect, useState } from 'react';
import type { PinSettings, ProtectedFeatureKey } from '@domain/entities/PinSettings';
import { useSettingsStore } from '@adapters/stores/useSettingsStore';

/**
 * 한 번 풀면 이만큼까지만 유효하다.
 *
 * 대시보드식 "시간 기반 자동 잠금"이 아니다. 옆핀의 재잠금 기준은 **사건**
 * (보호가 걸렸다 풀릴 때, [지금 가리기]를 누를 때)이고, 이 값은 그 사건이 하루 종일
 * 한 번도 없을 때 해제가 영원히 남는 것을 막는 안전핀일 뿐이다. 그래서 길게 잡는다 —
 * 짧게 잡으면 결국 시간 기반 잠금이 되어 선생님이 잠금을 꺼 버린다.
 */
export const SIDE_PIN_UNLOCK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** 지금 이 기능이 잠금 대상인가 — 설정이 실린 뒤에만 답할 수 있다 */
export function isFeatureLocked(settings: PinSettings, feature: ProtectedFeatureKey): boolean {
  if (!settings.enabled || settings.pinHash === null) return false;
  return settings.protectedFeatures[feature] === true;
}

export interface SidePinFeatureLock {
  /** 설정이 아직 안 실려 **판단할 수 없다.** 이때는 내용을 만들지 않는다 */
  readonly undecided: boolean;
  /** 지금 가려야 하는가 */
  readonly locked: boolean;
  /** PIN 을 맞췄다 — 창의 답을 기다리지 않고 바로 연다 */
  readonly markUnlocked: () => void;
}

export function useSidePinFeatureLock(
  feature: ProtectedFeatureKey,
  pinUnlockedAt: number | null,
): SidePinFeatureLock {
  const loaded = useSettingsStore((s) => s.loaded);
  const pin = useSettingsStore((s) => s.settings.pin);

  /**
   * 이 창에서 방금 PIN 을 맞췄다 — **창의 답을 기다리지 않고 바로 연다.**
   *
   * 창이 정본이지만 그 답을 기다렸다가 열면 통로가 없는 환경(옛 preload·브라우저 모드)에서
   * **영영 안 열린다.** 실제로 그렇게 만들어 봤다가 "PIN 을 맞춰도 안 열린다"는 신고를 받았다.
   */
  const [justUnlocked, setJustUnlocked] = useState(false);

  /**
   * 창이 "잠겼다"고 하면 임시 해제도 함께 내린다.
   * 없으면 본 앱에서 "지금 잠그기"를 눌러도 패널이 떠 있는 동안 계속 열려 있다.
   */
  useEffect(() => {
    if (pinUnlockedAt === null) setJustUnlocked(false);
  }, [pinUnlockedAt]);

  const undecided = !loaded;
  const featureLocked = !undecided && isFeatureLocked(pin, feature);
  const stillUnlocked =
    pinUnlockedAt !== null && Date.now() - pinUnlockedAt < SIDE_PIN_UNLOCK_MAX_AGE_MS;

  return {
    undecided,
    locked: featureLocked && !stillUnlocked && !justUnlocked,
    markUnlocked: () => setJustUnlocked(true),
  };
}
